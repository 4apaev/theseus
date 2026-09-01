import test   from 'node:test'
import assert from 'node:assert/strict'
import Crypto from 'node:crypto'

import * as Kfk from '@theseus/kafka'
import { DB, Query } from '@theseus/db'
import { goods, universe } from '@theseus/domain'

import {
    guid,
    waitFor,
    collectEvents,
    createPublisher,
    wherePayload,
} from '@theseus/testing'

import {
    eventTree as EVT,
    commandTree as CMD,
    createEventEnvelope,
} from '@theseus/contracts'

import startMarketService from '@theseus/market-service'

const PRFX = 'itg_market'

// ── helpers ──────────────────────────────────────────────────────────────────

function shipCreated(sid, pid, stid = 'sol.outpost') {
    return producer.publishEvent(createEventEnvelope({
        eid              : Crypto.randomUUID(),
        event_type       : EVT.ship.created,
        aggregate_id     : sid,
        aggregate_type   : 'ship',
        aggregate_version: 1,
        producer         : 'integration-test',
        payload          : {
            sid, pid, stid, name: 'far treasure', capacity: 20, velocity: 0.6,
            hull: 'starter', rig: 1, fitted: [], power: 0, power_pool: 8,
        },
    }))
}

function walletDebited(pid, rfid, amount) {
    return producer.publishEvent(createEventEnvelope({
        eid              : Crypto.randomUUID(),
        event_type       : EVT.wallet.debited,
        aggregate_id     : pid,
        aggregate_type   : 'wallet',
        aggregate_version: 1,
        producer         : 'integration-test',
        payload          : { pid, rfid, amount, balance: 1000 - amount },
    }))
}

async function selectStock(stid, gid) {
    const { stock } = await sql`
        SELECT stock
          FROM station_inventory
         WHERE stid = ${ stid }
           AND gid = ${ gid }`
    return stock
}

async function stockedAt(stid, gid) {
    const { n } = await sql`
        SELECT count(*) AS n
          FROM station_inventory
         WHERE stid = ${ stid }
           AND gid = ${ gid }`
    return +n > 0
}

async function cargoQty(sid, gid) {
    const { rows } = await query`
        SELECT quantity
          FROM cargo
         WHERE sid = ${ sid }
           AND gid = ${ gid }`
    return rows[ 0 ]?.quantity ?? 0
}

function walletCommandFor(pid) {
    return kafka.messages('commands.wallet')
        .map(msg => Kfk.decodeJson(msg.value))
        .find(cmd => cmd.payload.pid === pid)
}

function hasEvent(evt, key, id) {
    return e => e.event_type === evt && e.payload[ key ] === id
}

// ── fixtures ─────────────────────────────────────────────────────────────────

let service,
    kafka, publish, producer,
    pool, sql, query

test.before(async () => {
    // fresh market schema so seeded
    // stock and quotes are deterministic
    const admin = DB.create()
    await admin.query('drop schema if exists market cascade')
    await admin.end()

    pool     = DB.create({ schema: 'market' })
    query    = Query(pool)
    sql      = (...a) => query(...a).then(r => r.rows[ 0 ])

    kafka    = Kfk.createMemoryKafka()
    producer = Kfk.createProducer({ client: kafka })

    publish  = createPublisher(producer)
    service  = await startMarketService(kafka)
})

test.after(() => {
    service?.stop()
    pool?.end()
})

// ── tests ────────────────────────────────────────────────────────────────────

test('seed - every station:good has stock and a published quote', async () => {

    const { n: inv } = await sql`SELECT count(*) AS n FROM station_inventory`
    const { n: qts } = await sql`SELECT count(*) AS n FROM markets`
    /*
        one row exists per station × good.
        a station stocks every commodity.
        a station stocks a module only
        if it names the module.
    */
    const rows = universe.nodes
        .values()
        .reduce((n, st) =>
            n + Object.keys(goods).filter(gid =>
                goods[ gid ].kind !== 'module'
                || st.stocks?.includes(gid)).length, 0)

    assert.equal(+inv, rows)
    assert.equal(+qts, rows)

    const ore = await sql`
        SELECT price_buy, price_sell
          FROM markets
         WHERE stid = ${ 'sol.outpost' }
           AND gid = ${ 'ore' }`

    assert.ok(+ore.price_buy > +ore.price_sell, 'ask above bid')
})

test('buy - reserves stock, requests debit, settles on wallet.debited', async () => {
    const sid = guid(PRFX)
    const pid = guid(PRFX)

    await shipCreated(sid, pid)

    const before = await selectStock('sol.outpost', 'ore')
    const { events, stop } = collectEvents(kafka, [ 'events.market', 'events.cargo' ])

    await publish(CMD.market.buy.requested, {
        pid, sid,
        gid: 'ore',
        stid: 'sol.outpost',
        quantity: 10,
        price_unit_max: 30,
    })

    // reserve is synchronous with publish (memory kafka),
    // stock already down
    assert.equal(await selectStock('sol.outpost', 'ore'), before - 10)

    // the debit command flows out through the outbox
    const debit = await waitFor(walletCommandFor, '5s', 50, pid)

    assert.equal(debit.command_type, CMD.wallet.debit.requested)
    assert.match(debit.payload.rfid, /^trade_/)
    assert.ok(debit.payload.amount > 0)

    // player-service says the money moved - settle
    await walletDebited(pid, debit.payload.rfid, debit.payload.amount)

    const trade = await wherePayload(events, EVT.trade.executed, { pid }, '5s')

    // the quote republish is the last record of the settle batch -
    // wait for it too before we stop collecting
    await wherePayload(events, EVT.market.price.changed, { gid: 'ore' }, '5s')
    stop()

    assert.equal(trade.payload.side, 'buy')
    assert.equal(trade.payload.tid, debit.payload.rfid)

    assert.ok(events.some(hasEvent(EVT.cargo.loaded        , 'sid',  sid)))
    assert.ok(events.some(hasEvent(EVT.market.price.changed, 'gid', 'ore')))

    const cargo = await sql`
        SELECT quantity
          FROM cargo
         WHERE sid = ${ sid }
           AND gid = ${ 'ore' }`

    assert.equal(cargo.quantity, 10)

    const row = await sql`
        SELECT status
          FROM trades
         WHERE tid = ${ debit.payload.rfid }`

    assert.equal(row.status, 'executed')
})

test('buy - price above limit rejects and leaves stock alone', async () => {
    const sid = guid(PRFX)
    const pid = guid(PRFX)

    await shipCreated(sid, pid)

    const before = await selectStock('sol.outpost', 'ore')
    const { events, stop } = collectEvents(kafka, [ 'events.market' ])

    await publish(CMD.market.buy.requested, {
        pid, sid,
        gid: 'ore',
        stid: 'sol.outpost',
        quantity: 10,
        price_unit_max: 0.01,
    })

    const rejected = await wherePayload(events, EVT.trade.rejected, { pid }, 8000)
    stop()

    assert.equal(rejected.payload.reason, 'price above limit')
    assert.equal(await selectStock('sol.outpost', 'ore'), before)
})

// ── ship modules ─────────────────────────────────────────────────────────────

test('seed - modules are sparse: a station stocks only what it names', async () => {
    assert.ok(await stockedAt('sol.outpost', 'reactor.mk1'), 'starter dock: civilian line')
    assert.ok(!await stockedAt('sol.outpost', 'reactor.mk2'), 'starter dock: no specialist line')
    assert.ok(await stockedAt('sol.ganymede', 'reactor.mk2'), 'the yards: specialist line')
    assert.ok(!await stockedAt('sol.mars', 'reactor.mk1'), 'a plain hub stocks no modules')
})

test('buy - a module purchase is weighed by volume, not counted by piece', async () => {
    const sid = guid(PRFX)
    const pid = guid(PRFX)

    await shipCreated(sid, pid) // capacity 20

    const { events: loaded, stop: stopLoaded } = collectEvents(kafka, [ 'events.cargo' ])

    // 18 units of ore, volume 1 each - 18 of 20 capacity, leaves room by
    // piece count but not once a volume-4 module is weighed in
    await publish(CMD.market.buy.requested, {
        pid, sid,
        gid: 'ore',
        stid: 'sol.outpost',
        quantity: 18,
        price_unit_max: 1000,
    })

    const oreDebit = await waitFor(walletCommandFor, '5s', 50, pid)
    await walletDebited(pid, oreDebit.payload.rfid, oreDebit.payload.amount)
    await wherePayload(loaded, EVT.cargo.loaded, { sid }, '5s')
    stopLoaded()

    const before = await selectStock('sol.outpost', 'reactor.mk1')
    const { events, stop } = collectEvents(kafka, [ 'events.market' ])

    await publish(CMD.market.buy.requested, {
        pid, sid,
        gid: 'reactor.mk1',
        stid: 'sol.outpost',
        quantity: 1,
        price_unit_max: 10000,
    })
    const rejected = await wherePayload(events, EVT.trade.rejected, { pid }, '5s')
    stop()

    assert.equal(rejected.payload.reason, 'over capacity')
    assert.equal(await selectStock('sol.outpost', 'reactor.mk1'), before, 'nothing reserved')
})

test('module exchange - install then remove round-trips the package, station stock untouched', async () => {
    const sid = guid(PRFX)
    const pid = guid(PRFX)

    await shipCreated(sid, pid)

    const { events, stop } = collectEvents(kafka, [ 'events.cargo' ])

    await publish(CMD.market.buy.requested, {
        pid, sid,
        gid: 'reactor.mk1',
        stid: 'sol.outpost',
        quantity: 1,
        price_unit_max: 10000,
    })

    const debit = await waitFor(walletCommandFor, '5s', 50, pid)
    await walletDebited(pid, debit.payload.rfid, debit.payload.amount)
    await wherePayload(events, EVT.cargo.loaded, { sid }, '5s')

    assert.equal(await cargoQty(sid, 'reactor.mk1'), 1)
    const stockBefore = await selectStock('sol.outpost', 'reactor.mk1')

    await publish(CMD.cargo.module.exchange.requested, {
        pid, sid,
        operation: 'install',
        incoming: 'reactor.mk1',
        capacity_next: 20,
    })

    const installed = await wherePayload(events, EVT.cargo.module.exchanged, { sid, operation: 'install' }, '5s')

    assert.equal(installed.payload.load, 0)
    assert.equal(await cargoQty(sid, 'reactor.mk1'), 0)
    assert.equal(await selectStock('sol.outpost', 'reactor.mk1'), stockBefore, 'exchange never touches station stock')

    await publish(CMD.cargo.module.exchange.requested, {
        pid, sid,
        operation: 'remove',
        outgoing: 'reactor.mk1',
        capacity_next: 20,
    })

    const removed = await wherePayload(events, EVT.cargo.module.exchanged, { sid, operation: 'remove' }, '5s')
    stop()

    assert.equal(removed.payload.load, 4, 'reactor.mk1 volume, back in cargo')
    assert.equal(await cargoQty(sid, 'reactor.mk1'), 1)
})

test('module exchange - rejects a ship that does not exist', async () => {
    const { events, stop } = collectEvents(kafka, [ 'events.cargo' ])

    await publish(CMD.cargo.module.exchange.requested, {
        pid: guid(PRFX),
        sid: guid(PRFX),
        operation: 'install',
        incoming: 'reactor.mk1',
        capacity_next: 20,
    })
    const rejected = await wherePayload(events, EVT.cargo.module.exchange.rejected, { operation: 'install' }, '5s')
    stop()

    assert.deepEqual(rejected.payload.reasons, [ 'ship not found' ])
})
