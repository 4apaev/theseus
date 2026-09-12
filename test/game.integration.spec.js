import test   from 'node:test'
import assert from 'node:assert/strict'

import {
    guid,
    collectEvents,
    createPublisher,
    wherePayload,
} from '#testing/index.js'

import startPlayer from '@theseus/player-service'
import startShip   from '@theseus/ship-service'
import startMarket from '@theseus/market-service'
import * as Kfk from '@theseus/kafka'
import { DB } from '@theseus/db'
import {
    eventTree as EVT,
    commandTree as CMD,
} from '@theseus/contracts'

const PRFX = 'itg_game'

// travel times shrunk by TIME_SCALE in .env.dev: sol → barnards ≈ 1s

/*
    the phase 1 loop, minus the gateway:

    register → wallet + starter ship
    buy ore cheap at sol.outpost      (producer surplus)
    fly it to barnards.port           (relativistic transit)
    sell it dear                      (consumer scarcity)
    count the profit
*/

// ── fixtures ─────────────────────────────────────────────────────────────────

let kafka, publish, services

test.before(async () => {
    // fresh economy so seeded stock and quotes are deterministic
    const admin = DB.create()
    await admin.query('drop schema if exists market cascade')
    await admin.end()

    kafka   = Kfk.createMemoryKafka()
    publish = createPublisher(Kfk.createProducer({ client: kafka }))

    services = [
        await startPlayer(kafka),
        await startShip(kafka),
        await startMarket(kafka),
    ]
})

test.after(() => {
    services?.forEach(s => s.stop())
})

// ── the loop ─────────────────────────────────────────────────────────────────

test('a trader can profit from ore arbitrage across the triangle', async () => {
    const handle = guid(PRFX)
    const { events, stop } = collectEvents(kafka, [
        'events.player',
        'events.wallet',
        'events.ship',
        'events.market',
        'events.cargo',
    ])

    // ── register - player, wallet and the free ship appear ──
    await publish(CMD.player.register.requested, { handle, password: 'secret' })

    const created = await wherePayload(events, EVT.player.created, { handle }, '10s')
    const { pid } = created.payload

    const freebie = await wherePayload(events, EVT.ship.created, { pid }, '10s')
    const { sid } = freebie.payload
    assert.equal(freebie.payload.stid, 'sol.outpost')

    // ── buy ore where it is mined ──
    await publish(CMD.market.buy.requested, {
        pid, sid,
        gid: 'ore',
        stid: 'sol.outpost',
        quantity: 10,
        price_unit_max: 30,
    })

    const bought = await wherePayload(events, EVT.trade.executed, { pid, side: 'buy' }, '15s')

    assert.ok(events.some(e => e.event_type === EVT.cargo.loaded && e.payload.sid === sid))

    // ── fly it where it is craved ──
    await publish(CMD.ship.travel.requested, {
        sid, pid,
        from: 'sol.outpost',
        to  : 'barnards.port',
    })

    await wherePayload(events, EVT.ship.arrived, { sid }, '15s')

    // ── sell into the scarcity ──
    await publish(CMD.market.sell.requested, {
        pid, sid,
        gid: 'ore',
        stid: 'barnards.port',
        quantity: 10,
        price_unit_min: 50,
    })

    const sold = await wherePayload(events, EVT.trade.executed, { pid, side: 'sell' }, '15s')

    const credited = await wherePayload(events, EVT.wallet.credited, { pid }, '15s')

    stop()

    // ── count the profit ──
    const cost    = +bought.payload.price_total
    const revenue = +sold.payload.price_total
    const balance = +credited.payload.balance

    assert.ok(revenue > cost, `arbitrage pays: sold ${ revenue } vs paid ${ cost }`)
    assert.equal(balance, Math.round((1000 - cost + revenue) * 100) / 100)
    assert.ok(balance > 1000, `trader is richer: ₢${ balance }`)

    // the whole story flowed through kafka
    for (const type of [
        EVT.player.created,
        EVT.wallet.created,
        EVT.ship.created,
        EVT.wallet.debited,
        EVT.cargo.loaded,
        EVT.ship.departed,
        EVT.ship.arrived,
        EVT.cargo.unloaded,
        EVT.wallet.credited,
        EVT.market.price.changed,
    ])
        assert.ok(events.some(e => e.event_type === type), `${ type } observed`)
})

/*
    the ship modules loop, end to end, 3 real services talking through kafka:

    register → the starter rig
    fund the shopping trip             (a reactor.mk2 + cruise.mk2 costs more
                                        than the starter wallet - ore arbitrage
                                        on the way pays for it)
    fly to the yards                   (the only station stocking cruise.mk2)
    buy the module, fit it             (cruise.mk2 needs reactor.mk2 first)
    feel the difference                (velocity actually changes)
    remove it, the package comes back
    sell it back
*/
test('a captain buys a faster drive, fits it, feels the difference, then sells it back', async () => {
    const handle = guid(PRFX)
    const { events, stop } = collectEvents(kafka, [
        'events.player',
        'events.wallet',
        'events.ship',
        'events.market',
        'events.cargo',
    ])

    // ── register - the starter rig ──
    await publish(CMD.player.register.requested, { handle, password: 'secret' })

    const created = await wherePayload(events, EVT.player.created, { handle }, '10s')
    const { pid } = created.payload

    const freebie = await wherePayload(events, EVT.ship.created, { pid }, '10s')
    const { sid } = freebie.payload
    const startVelocity = freebie.payload.velocity

    assert.equal(startVelocity, 0.6)

    // ── fund the trip - ore is cheap where mined, dear where scarce ──
    await publish(CMD.market.buy.requested, { pid, sid, gid: 'ore', stid: 'sol.outpost', quantity: 20, price_unit_max: 100 })
    await wherePayload(events, EVT.cargo.loaded, { sid, gid: 'ore' }, '15s')

    await publish(CMD.ship.travel.requested, { sid, pid, from: 'sol.outpost', to: 'sol.venus' })
    await wherePayload(events, EVT.ship.arrived, { sid, stid: 'sol.venus' }, '15s')

    await publish(CMD.market.sell.requested, { pid, sid, gid: 'ore', stid: 'sol.venus', quantity: 20, price_unit_min: 1 })
    await wherePayload(events, EVT.wallet.credited, { pid }, '15s')

    // ── fly to the yards ──
    await publish(CMD.ship.travel.requested, { sid, pid, from: 'sol.venus', to: 'sol.ganymede' })
    await wherePayload(events, EVT.ship.arrived, { sid, stid: 'sol.ganymede' }, '15s')

    // ── cruise.mk2 requires the power capability at rank 2 - reactor.mk2
    // provides it, reactor.mk1 does not. buy and fit that first. ──
    await publish(CMD.market.buy.requested, { pid, sid, gid: 'reactor.mk2', stid: 'sol.ganymede', quantity: 1, price_unit_max: 10000 })
    await wherePayload(events, EVT.cargo.loaded, { sid, gid: 'reactor.mk2' }, '15s')

    await publish(CMD.ship.module.install.requested, {               pid, sid, slot: 'power1', gid: 'reactor.mk2' })
    const reactorFit = await wherePayload(events, EVT.ship.rig.changed, { sid, slot: 'power1' }, '15s')
    assert.equal(reactorFit.payload.outgoing, 'reactor.mk1', 'the starter reactor left the slot')

    // ── buy the faster drive, fit it ──
    await publish(CMD.market.buy.requested, { pid, sid, gid: 'cruise.mk2', stid: 'sol.ganymede', quantity: 1, price_unit_max: 10000 })
    await wherePayload(events, EVT.cargo.loaded, { sid, gid: 'cruise.mk2' }, '15s')

    await publish(CMD.ship.module.install.requested, { sid, pid, slot: 'cruise1', gid: 'cruise.mk2' })
    const cruiseFit = await wherePayload(events, EVT.ship.rig.changed, { sid, slot: 'cruise1', incoming: 'cruise.mk2' }, '15s')

    // ── feel the difference - the same route now takes less time ──
    assert.ok(cruiseFit.payload.velocity > startVelocity, `faster now: ${ cruiseFit.payload.velocity }c`)

    // ── remove it - the package comes back to cargo, the old speed returns ──
    await publish(CMD.ship.module.remove.requested, { sid, pid, slot: 'cruise1' })
    const removed = await wherePayload(events, EVT.ship.rig.changed, { sid, slot: 'cruise1', outgoing: 'cruise.mk2' }, '15s')
    assert.equal(removed.payload.velocity, startVelocity, 'back to the old drive\'s speed')

    // ── sell the drive back at the yards ──
    await publish(CMD.market.sell.requested, { pid, sid, gid: 'cruise.mk2', stid: 'sol.ganymede', quantity: 1, price_unit_min: 1 })
    const sold = await wherePayload(events, EVT.trade.executed, { pid, side: 'sell', gid: 'cruise.mk2' }, '15s')
    stop()

    assert.ok(+sold.payload.price_total > 0, 'the drive resells for something')
})
