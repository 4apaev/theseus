import test   from 'node:test'
import assert from 'node:assert/strict'
import Crypto from 'node:crypto'

import { DB }    from '@theseus/db'
import { Query } from '@theseus/util'
import * as Kfk  from '@theseus/kafka'

import {
    guid,
    waitFor,
    collectEvents,
    createPublisher,
} from '#testing/index.js?title=🧪 INTEGRATION 🎰 MARKET'

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
        payload          : { sid, pid, stid, name: 'far treasure', capacity: 20, velocity: 0.6 },
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

    assert.equal(+inv, 9)
    assert.equal(+qts, 9)

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

    const executed = hasEvent(EVT.trade.executed, 'pid',  pid)
    await waitFor(() => events.some(executed), '5s')

    // the quote republish is the last record of the settle batch -
    // wait for it too before we stop collecting
    await waitFor(() => events.some(hasEvent(EVT.market.price.changed, 'gid', 'ore')), '5s')
    stop()

    const trade = events.find(executed)
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

    const rejected = e => e.event_type === EVT.trade.rejected && e.payload.pid === pid
    await waitFor(() => events.some(rejected), 8000)
    stop()

    assert.equal(events.find(rejected).payload.reason, 'price above limit')
    assert.equal(await selectStock('sol.outpost', 'ore'), before)
})
