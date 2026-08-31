import test   from 'node:test'
import assert from 'node:assert/strict'

import { DB, Query } from '@theseus/db'
import * as Kfk      from '@theseus/kafka'

import {
    guid,
    waitFor,
    collectEvents,
    createPublisher,
} from '#testing/index.js'

import startPlayer     from '@theseus/player-service'
import startShip       from '@theseus/ship-service'
import startMarket     from '@theseus/market-service'
import startProjection from '@theseus/projection-service'

import {
    eventTree as EVT,
    commandTree as CMD,
} from '@theseus/contracts'

import { rebuild } from '../scripts/rebuild.js'

const PRFX = 'itg_rebuild'

function hasEvent(evt, key, id) {
    return e => e.event_type === evt && e.payload[ key ] === id
}

// ── fixtures ─────────────────────────────────────────────────────────────────

let kafka, publish, services, pool, sql

test.before(async () => {
    // fresh economy so seeded stock covers this file's own trades
    const admin = DB.create()
    await admin.query('drop schema if exists market cascade')
    await admin.end()

    kafka   = Kfk.createMemoryKafka()
    publish = createPublisher(Kfk.createProducer({ client: kafka }))
    pool    = DB.create({ schema: 'projection' })
    sql     = Query(pool)

    services = [
        await startPlayer(kafka),
        await startShip(kafka),
        await startMarket(kafka),
        await startProjection(kafka),
    ]
})

test.after(() => {
    services?.forEach(s => s.stop())
    pool?.end()
})

// ── snapshot helper - business columns only, bookkeeping timestamps excluded ─

async function snapshot(pid, sid) {
    const rows = (...a) => sql(...a).then(r => r.rows)

    return {
        players : await rows`SELECT pid, handle        FROM players WHERE pid = ${ pid }`,
        wallets : await rows`SELECT pid, balance       FROM wallets WHERE pid = ${ pid }`,
        cargo   : await rows`SELECT sid, gid, quantity FROM cargo   WHERE sid = ${ sid }`,
        ships   : await rows`
            SELECT sid, pid, stid, name, status, capacity, velocity, "from", "to", departs, arrives, arrived, years_abs, years_rel
              FROM ships
             WHERE sid = ${ sid }`,

        prices  : await rows`
            SELECT stid, gid, price_buy, price_sell
              FROM market_prices
             WHERE stid in ('sol.outpost', 'barnards.port') and gid = 'ore'
             ORDER BY stid`,
        trades  : await rows`
            SELECT tid, gid, pid, sid, stid, quantity, price_total, price_unit, side
              FROM trade_history
             WHERE pid = ${ pid }
             ORDER BY side`,
    }
}

// ── the test ─────────────────────────────────────────────────────────────────

test('truncate + replay through event_log reproduces the exact same read models', async () => {
    const handle = guid(PRFX)
    const { events, stop } = collectEvents(kafka, [
        'events.player',
        'events.wallet',
        'events.ship',
        'events.market',
        'events.cargo',
    ])

    await publish(CMD.player.register.requested, { handle, password: 'secret' })
    const created = await waitFor(() => events.find(hasEvent(EVT.player.created, 'handle', handle)), '10s')
    const { pid } = created.payload

    const freebie = await waitFor(() => events.find(hasEvent(EVT.ship.created, 'pid', pid)), '10s')
    const { sid } = freebie.payload

    await publish(CMD.market.buy.requested, {
        pid, sid,
        gid           : 'ore',
        stid          : 'sol.outpost',
        quantity      : 10,
        price_unit_max: 30,
    })

    await waitFor(() => events.find(e => /*
        */ e.event_type === EVT.trade.executed
        && e.payload.pid === pid
        && e.payload.side === 'buy'), '15s')

    await publish(CMD.ship.travel.requested, { sid, pid, from: 'sol.outpost', to: 'barnards.port' })
    await waitFor(() => events.find(hasEvent(EVT.ship.arrived, 'sid', sid)), '15s')

    await publish(CMD.market.sell.requested, {
        pid, sid,
        gid           : 'ore',
        stid          : 'barnards.port',
        quantity      : 10,
        price_unit_min: 50,
    })
    await waitFor(() => events.find(e => /*
        */ e.event_type === EVT.trade.executed
        && e.payload.pid === pid
        && e.payload.side === 'sell'), '15s')

    stop()

    /* ──
        wait for both trades and both price moves.
        this event needs one more kafka hop than the wait above it.
        give it the same timeout, not the default 5s.
        the default caused a real flake. give explicit timeouts to all waits.
    ── */
    await waitFor(async () => {
        const trades = await sql`select count(*) as n from trade_history where pid = ${ pid }`
        const prices = await sql`select count(*) as n from market_prices where stid in ('sol.outpost', 'barnards.port') and gid = 'ore'`
        return +trades.rows[ 0 ].n === 2 && +prices.rows[ 0 ].n === 2
    }, '15s')

    const before = await snapshot(pid, sid)
    assert.ok(before.trades.length === 2, 'buy + sell both landed pre-rebuild')

    await rebuild()

    const after = await snapshot(pid, sid)
    assert.deepEqual(after, before, 'read models identical after truncate + replay')
})
