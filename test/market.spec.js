import test           from 'node:test'
import assert         from 'node:assert/strict'
import { setTimeout } from 'node:timers/promises'

import {
    makeCmd,
    fakePool,
    fakeClient,
    fakeTransact,
    outboxEvents,
} from '#testing/index.js'

import { goods, universe } from '@theseus/domain'

import { createHandlers } from '#market/handlers.js'
import { seed, quote    } from '#market/seed.js'
import { pollDrift      } from '#market/drift.js'

// ── fixtures ─────────────────────────────────────────────────────────────────
// each fixture is a queue entry: a function for one query response,
// in the same order the handler under test actually issues its queries.

/**
 * @param  {{ raw: string[] }} s
 * @param  {any[]} a
 * @return {(q: { sql: string }) => boolean}
 */
const Rx = (s, ...a) => q => RegExp(String.raw(s, ...a), 'i').test(q.sql)

Rx.insert = Rx`INSERT +INTO`
Rx.insert.station = Rx`INSERT +INTO +station_inventory`
Rx.insert.markets = Rx`INSERT +INTO +markets`
Rx.insert.trades  = Rx`INSERT +INTO +trades`
Rx.insert.cargo   = Rx`INSERT +INTO +cargo`

Rx.insert.station = Rx`INSERT +INTO +station_inventory`
Rx.insert.markets = Rx`INSERT +INTO +markets`
Rx.insert.trades  = Rx`INSERT +INTO +trades`
Rx.insert.cargo   = Rx`INSERT +INTO +cargo`

Rx.update = Rx`UPDATE +\w`
Rx.update.station = Rx`UPDATE +station_inventory`
Rx.update.trades  = Rx`UPDATE +trades`
Rx.update.markets = Rx`UPDATE +markets`
Rx.update.cargo   = Rx`UPDATE +cargo`

const buyCmd = (over = {}) => makeCmd({
    gid           : 'ore',
    pid           : 'p1',
    sid           : 's1',
    stid          : 'sol.outpost',
    quantity      : 10,
    price_unit_max: 30,
    ...over,
})

const sellCmd = (over = {}) => makeCmd({
    gid           : 'ore',
    pid           : 'p1',
    sid           : 's1',
    stid          : 'barnards.port',
    quantity      : 10,
    price_unit_min: 50,
    ...over,
})

const dockedShip = (over = {}) => () => ({ rows: [{
    sid     : 's1',
    pid     : 'p1',
    stid    : 'sol.outpost',
    status  : 'docked',
    capacity: 20,
    ...over,
}]})

const stocked = (stock = 160, target = 100) => () => ({ rows: [{ stock, target }]})
const noCargo = () => ({ rows: [{ total: 0 }]})
const empty   = () => ({ rows: []})

function handlers(overrides = []) {
    const client = fakeClient(overrides)
    return { client, fx: createHandlers(client, fakeTransact(client)) }
}

// ── quotes ────────────────────────────────────────────────────────────────────

test('arbitrage exists: ore is cheap where produced, dear where craved', () => {
    const sol      = quote('ore', 160, 100) // producer surplus
    const barnards = quote('ore', 40, 100)  // consumer scarcity
    assert.ok(sol.price_buy < barnards.price_sell, 'buy low, fly, sell high')
})

// ── seed ──────────────────────────────────────────────────────────────────────

test('seed fills every station × good and publishes a quote for each', async () => {
    // one row per station × good. the universe decides how many.
    const rows = universe.nodes.size * Object.keys(goods).length

    const pool = fakePool()
    assert.equal(await seed(pool, fakeTransact(pool.client)), rows)

    const { log } = pool.client
    assert.equal(log.filter(Rx.insert.station).length, rows)
    assert.equal(log.filter(Rx.insert.markets).length, rows)

    const events = outboxEvents(pool.client)
    assert.equal(events.length, rows)
    assert.ok(events.every(e => e.event_type === 'market.price.changed.v1'))
    assert.ok(events.every(e => e.payload.price_buy > e.payload.price_sell), 'ask above bid')
})

test('seed is idempotent - a populated market is left alone', async () => {
    const pool = fakePool([ () => ({ rows: everyPair() }) ])
    assert.equal(await seed(pool, fakeTransact(pool.client)), 0)
    assert.ok(!pool.client.log.some(Rx.insert))
})

// a new station in the universe gets its markets, and nothing else moves
test('seed adds only the missing station * good', async () => {
    const pool = fakePool([
        () => ({ rows: everyPair().filter(r => r.stid !== 'sol.mars') }),
    ])

    assert.equal(await seed(pool, fakeTransact(pool.client)), Object.keys(goods).length)
    assert.ok(pool.client.log
        .filter(Rx.insert.station)
        .every(q => q.params[ 0 ] === 'sol.mars'))
})

function everyPair() {
    return universe.nodes.values()
        .flatMap(st => Object.keys(goods).map(gid => ({ stid: st.stid, gid })))
        .toArray()
}

// ── buy - rejections ──────────────────────────────────────────────────────────
// each queue matches marketBuyRequested's real order: lockStock, getShip,
// cargoTotal - only as many entries as the rejected path actually reaches.

for (const [ reason, overrides, cmd ] of [
    [ 'unknown market'      , []],
    [ 'ship unknown'        , [ stocked(), empty ]],
    [ 'ship not docked here', [ stocked(), dockedShip({ status: 'transit' }) ]],
    [ 'ship not docked here', [ stocked(), dockedShip({ stid: 'barnards.port' }) ]],
    [ 'insufficient stock'  , [ stocked(5), dockedShip() ]],
    [ 'over capacity'       , [ stocked(), dockedShip(), () => ({ rows: [{ total: 15 }]}) ]],
    [ 'price above limit'   , [ stocked(), dockedShip(), noCargo ], buyCmd({ price_unit_max: 1 }) ],
]) {
    test(`buy rejects: ${ reason }`, async () => {
        const { client, fx } = handlers(overrides)
        await fx[ 'market.buy.requested.v1' ](cmd ?? buyCmd())

        const [ e ] = outboxEvents(client)
        assert.equal(e.event_type, 'market.trade.rejected.v1')
        assert.equal(e.payload.reason, reason)
        assert.equal(e.payload.side, 'buy')
        assert.ok(!client.log.some(Rx.insert.trades), 'nothing reserved')
        assert.ok(!client.log.some(Rx.update.station), 'stock untouched')
    })
}

// ── buy - reserve ─────────────────────────────────────────────────────────────

test('buy reserves stock, records the trade, requests the debit', async () => {
    const { client, fx } = handlers([ stocked(), dockedShip(), noCargo ])
    await fx[ 'market.buy.requested.v1' ](buyCmd())

    const bump = client.log.find(Rx.update.station)
    assert.equal(bump.params[ 2 ], -10, 'stock reserved')

    const insert = client.log.find(Rx.insert.trades)
    assert.ok(insert, 'trade recorded')
    const [ tid, , , , , qty, priceUnit, total ] = insert.params
    assert.match(tid, /^trade_/)

    const [ debit ] = outboxEvents(client)
    assert.equal(debit.command_type, 'wallet.debit.requested.v1')
    assert.equal(debit.requested_by, 'market-service')
    assert.equal(debit.payload.rfid, tid, 'tid rides as rfid')
    assert.equal(debit.payload.amount, total)
    assert.equal(debit.payload.amount, Math.round(priceUnit * qty * 100) / 100)
})

// ── sell ──────────────────────────────────────────────────────────────────────
// marketSellRequested's real order: lockStock, getShip, the cargo check.

test('sell rejects: insufficient cargo', async () => {
    const { client, fx } = handlers([
        stocked(40),
        dockedShip({ stid: 'barnards.port' }),
        () => ({ rows: [{ quantity: 3 }]}),
    ])
    await fx[ 'market.sell.requested.v1' ](sellCmd())

    const [ e ] = outboxEvents(client)
    assert.equal(e.event_type, 'market.trade.rejected.v1')
    assert.equal(e.payload.reason, 'insufficient cargo')
    assert.equal(e.payload.side, 'sell')
})

test('sell rejects: price below limit', async () => {
    const { client, fx } = handlers([
        stocked(160), // glut → cheap
        dockedShip({ stid: 'barnards.port' }),
        () => ({ rows: [{ quantity: 10 }]}),
    ])
    await fx[ 'market.sell.requested.v1' ](sellCmd({ price_unit_min: 500 }))

    const [ e ] = outboxEvents(client)
    assert.equal(e.payload.reason, 'price below limit')
})

test('sell hands over cargo, records the trade, requests the credit', async () => {
    const { client, fx } = handlers([
        stocked(40), // scarcity → good sell price
        dockedShip({ stid: 'barnards.port' }),
        () => ({ rows: [{ quantity: 10 }]}),
    ])
    await fx[ 'market.sell.requested.v1' ](sellCmd())

    const unload = client.log.find(Rx.update.cargo)
    assert.deepEqual(unload.params, [ 's1', 'ore', 10 ])

    const [ credit ] = outboxEvents(client)
    assert.equal(credit.command_type, 'wallet.credit.requested.v1')
    assert.match(credit.payload.rfid, /^trade_/)
    assert.ok(credit.payload.amount > 500, 'scarcity pays')
})

// ── continuation ──────────────────────────────────────────────────────────────
// settle()'s real order: pendingTrade, then lockStock (buy) or bumpStock
// (sell) - the rest of the queries never inspect their own response.

const pendingBuy = (over = {}) => () => ({ rows: [{
    tid        : 'trade_1',
    pid        : 'p1',
    sid        : 's1',
    stid       : 'sol.outpost',
    gid        : 'ore',
    side       : 'buy',
    quantity   : 10,
    price_unit : '25.03',
    price_total: '250.33',
    status     : 'pending',
    ...over,
}]})

const debited = { eid: 'evt-1', correlation_id: 'corr-test', payload: { pid: 'p1', rfid: 'trade_1', amount: 250.33, balance: 749.67 }}

test('wallet.debited settles the buy: cargo loaded, trade executed, quote republished', async () => {
    const { client, fx } = handlers([ pendingBuy(), stocked(150) ])
    await fx[ 'wallet.debited.v1' ](debited)

    assert.ok(client.log.some(Rx.insert.cargo), 'cargo loaded')
    const settle = client.log.find(Rx.update.trades)
    assert.deepEqual(settle.params, [ 'trade_1', 'executed' ])
    assert.ok(client.log.some(Rx.update.markets), 'quote board updated')

    const types = outboxEvents(client).map(e => e.event_type)
    assert.deepEqual(types, [ 'cargo.loaded.v1', 'market.trade.executed.v1', 'market.price.changed.v1' ])

    const executed = outboxEvents(client).find(e => e.event_type === 'market.trade.executed.v1')
    assert.equal(executed.payload.tid, 'trade_1')
    assert.equal(executed.payload.price_total, 250.33)
    assert.equal(executed.causation_id, 'evt-1')
})

test('wallet.credited settles the sell: stock restocked, cargo.unloaded emitted', async () => {
    const { client, fx } = handlers([
        pendingBuy({ side: 'sell', stid: 'barnards.port', price_unit: '108.10', price_total: '1081.01' }),
        () => ({ rows: [{ stock: 50, target: 100 }]}),
    ])
    await fx[ 'wallet.credited.v1' ]({ ...debited, payload: { ...debited.payload, amount: 1081.01 }})

    const bump = client.log.find(Rx.update.station)
    assert.equal(bump.params[ 2 ], 10, 'station takes delivery')

    const types = outboxEvents(client).map(e => e.event_type)
    assert.deepEqual(types, [ 'cargo.unloaded.v1', 'market.trade.executed.v1', 'market.price.changed.v1' ])
})

test('wallet events with no pending trade are ignored', async () => {
    const { client, fx } = handlers()
    await fx[ 'wallet.debited.v1' ](debited)
    assert.equal(outboxEvents(client).length, 0)
})

test('wallet.credited ignores a pending buy (side mismatch)', async () => {
    const { client, fx } = handlers([ pendingBuy() ])
    await fx[ 'wallet.credited.v1' ](debited)
    assert.equal(outboxEvents(client).length, 0)
})

// ── compensation ──────────────────────────────────────────────────────────────
// walletTransactionRejected's 2nd query (bumpStock or the cargo UPDATE) and
// everything after it never reads its own response - one queue entry is
// enough even though more queries follow.

test('wallet rejection on a buy releases the reserved stock', async () => {
    const { client, fx } = handlers([ pendingBuy() ])
    await fx[ 'wallet.transaction.rejected.v1' ]({
        eid           : 'evt-2',
        correlation_id: 'corr-test',
        payload       : { pid: 'p1', rfid: 'trade_1', amount: 250.33, reason: 'insufficient funds' },
    })

    const bump = client.log.find(Rx.update.station)
    assert.equal(bump.params[ 2 ], 10, 'stock released')

    const settle = client.log.find(Rx.update.trades)
    assert.deepEqual(settle.params, [ 'trade_1', 'rejected' ])

    const [ e ] = outboxEvents(client)
    assert.equal(e.event_type, 'market.trade.rejected.v1')
    assert.equal(e.payload.reason, 'insufficient funds')
    assert.equal(e.payload.side, 'buy')
})

test('wallet rejection on a sell returns the cargo', async () => {
    const { client, fx } = handlers([ pendingBuy({ side: 'sell' }) ])
    await fx[ 'wallet.transaction.rejected.v1' ]({
        eid           : 'evt-2',
        correlation_id: 'corr-test',
        payload       : { pid: 'p1', rfid: 'trade_1', amount: 1081.01, reason: 'wallet not found' },
    })

    const back = client.log.find(Rx.update.cargo)
    assert.deepEqual(back.params, [ 's1', 'ore', 10 ])

    const [ e ] = outboxEvents(client)
    assert.equal(e.payload.side, 'sell')
})

// ── ships mirror ──────────────────────────────────────────────────────────────

test('ships mirror follows created / departed / arrived', async () => {
    const { client, fx } = handlers()

    await fx[ 'ship.created.v1' ]({ payload: { sid: 's1', pid: 'p1', stid: 'sol.outpost', capacity: 20, name: 'x', velocity: 0.6 }})
    await fx[ 'ship.departed.v1' ]({ payload: { sid: 's1' }})
    await fx[ 'ship.arrived.v1' ]({ payload: { sid: 's1', stid: 'barnards.port' }})

    const [ ins, dep, arr ] = client.log
    assert.match(ins.sql, /INSERT INTO ships/i)
    assert.match(dep.sql, /SET status = 'transit'/i)
    assert.match(arr.sql, /SET status = 'docked'/i)
    assert.equal(arr.params[ 1 ], 'barnards.port')
})

// ── living economy - drift ───────────────────────────────────────────────────

test('pollDrift moves stock toward its natural level, both directions', async () => {
    const seen = []
    // driftOne makes 2 different-shaped calls per pair that moved: the
    // station_inventory update, then a markets update whose response it
    // never reads. one queue entry answers both - harmless, since (a) the
    // 2nd, wrongly-shaped call's response is discarded either way, and (b)
    // `at()` below takes the first match per pair, which is always the
    // real station_inventory answer, pushed before the stray one.
    const client = fakeClient([
        ([ stid, gid, level, rate ]) => {
            seen.push({ stid, gid, level, rate })
            return { rows: [{ stock: level, target: 100 }]}   // one step lands on the level
        },
    ])

    const poller = pollDrift({}, fakeTransact(client), { interval: 10 })
    await setTimeout(20)
    poller.stop()

    const at = (stid, gid) => seen.find(x => x.stid === stid && x.gid === gid)

    // seed.js puts a producer on a surplus and a consumer near dry.
    // drift must aim at those same levels, never past them.
    assert.deepEqual(at('sol.outpost', 'ore'),   { stid: 'sol.outpost', gid: 'ore',   level: 160, rate: 8 })
    assert.deepEqual(at('sol.outpost', 'grain'), { stid: 'sol.outpost', gid: 'grain', level: 40,  rate: 5 })

    const events = outboxEvents(client)
    assert.ok(events.length >= 6, 'every produce/consume pair drifted')
    assert.ok(events.every(e => e.event_type === 'market.price.changed.v1'))
})

// the bug this replaced: stock reached 0, and price = base * 100 ** elasticity
test('pollDrift never drives a consumer station to zero stock', async () => {
    const client = fakeClient([
        ([ , , level ]) => ({ rows: [{ stock: level, target: 100 }]}),
    ])

    const poller = pollDrift({}, fakeTransact(client), { interval: 10 })
    await setTimeout(20)
    poller.stop()

    const prices = outboxEvents(client).map(e => e.payload.price_buy)
    assert.ok(prices.every(p => p > 0 && p < 1000), `every price stays sane: ${ prices }`)
})

test('pollDrift leaves settled stations alone', async () => {
    // an empty row means driftOne stops right there - no 2nd call per pair,
    // so this one entry never faces the 2-shapes-per-pair ambiguity above.
    const client = fakeClient([
        () => ({ rows: []}), // clamp guard. stock did not move.
    ])

    const poller = pollDrift({}, fakeTransact(client), { interval: 10 })
    await setTimeout(20)
    poller.stop()

    assert.equal(outboxEvents(client).length, 0)

    assert.ok(!client.log.some(Rx.update.markets), 'no quote republished')
})

test('pollDrift with interval 0 never starts', async () => {
    const client = fakeClient([
        () => { throw new Error('drift must not run') },
    ])

    const poller = pollDrift({}, fakeTransact(client), { interval: 0 })
    await setTimeout(20)
    poller.stop()

    assert.equal(client.log.length, 0)
})

test('pollDrift stop prevents further polling', async () => {
    let ticks = 0
    const client = fakeClient([
        () => { ticks++; return { rows: []} },
    ])

    const poller = pollDrift({}, fakeTransact(client), { interval: 10 })
    await setTimeout(5)
    poller.stop()
    const snapshot = ticks
    await setTimeout(50)
    assert.equal(ticks, snapshot)
})
