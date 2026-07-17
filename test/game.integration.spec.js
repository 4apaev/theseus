import test   from 'node:test'
import assert from 'node:assert/strict'

import {
    guid,
    waitFor,
    collectEvents,
    createPublisher,
} from '#testing/index.js?title=🧪 INTEGRATION 🚀 GAME'

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

function hasEvent(evt, key, id) {
    return e => e.event_type === evt && e.payload[ key ] === id
}

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

    const created = await waitFor(() => events.find(hasEvent(EVT.player.created, 'handle', handle)), '10s')
    const { pid } = created.payload

    const freebie = await waitFor(() => events.find(hasEvent(EVT.ship.created, 'pid', pid)), '10s')
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

    const bought = await waitFor(() =>
        events.find(e =>
            e.event_type === EVT.trade.executed
            && e.payload.pid === pid
            && e.payload.side === 'buy'), '15s')

    assert.ok(events.some(hasEvent(EVT.cargo.loaded, 'sid', sid)))

    // ── fly it where it is craved ──
    await publish(CMD.ship.travel.requested, {
        sid, pid,
        from: 'sol.outpost',
        to  : 'barnards.port',
    })

    await waitFor(() => events.find(hasEvent(EVT.ship.arrived, 'sid', sid)), '15s')

    // ── sell into the scarcity ──
    await publish(CMD.market.sell.requested, {
        pid, sid,
        gid: 'ore',
        stid: 'barnards.port',
        quantity: 10,
        price_unit_min: 50,
    })

    const sold = await waitFor(() =>
        events.find(e =>
            e.event_type === EVT.trade.executed
            && e.payload.pid === pid
            && e.payload.side === 'sell'), '15s')

    const credited = await waitFor(() => events.find(hasEvent(EVT.wallet.credited, 'pid', pid)), '15s')

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
