import test   from 'node:test'
import assert from 'node:assert/strict'

import {
    makeCmd,
    fakePool,
    fakeClient,
    fakeTransact,
    outboxEvents,
} from '#testing/index.js?title=🧪 🎰 MARKET'

import { createHandlers } from '#market/handlers.js'
import { seed, quote    } from '#market/seed.js'

// ── fixtures ─────────────────────────────────────────────────────────────────

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

const dockedShip = (over = {}) => ({
    'FROM ships': () => ({ rows: [{
        sid     : 's1',
        pid     : 'p1',
        stid    : 'sol.outpost',
        status  : 'docked',
        capacity: 20,
        ...over,
    }]}),
})

const stocked = (stock = 160, target = 100) => ({
    'FROM station_inventory': () => ({ rows: [{ stock, target }]}),
})

const noCargo = { COALESCE: () => ({ rows: [{ total: 0 }]}) }

function handlers(overrides = {}) {
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
    const pool = fakePool()
    assert.equal(await seed(pool, fakeTransact(pool.client)), true)

    const { log } = pool.client
    assert.equal(log.filter(q => q.sql.includes('insert into station_inventory')).length, 9)
    assert.equal(log.filter(q => q.sql.includes('insert into markets')).length, 9)

    const events = outboxEvents(pool.client)
    assert.equal(events.length, 9)
    assert.ok(events.every(e => e.event_type === 'market.price.changed.v1'))
    assert.ok(events.every(e => e.payload.price_buy > e.payload.price_sell), 'ask above bid')
})

test('seed is idempotent - populated market is left alone', async () => {
    const pool = fakePool({
        'select 1 from station_inventory': () => ({ rows: [{ ok: 1 }]}),
    })
    assert.equal(await seed(pool, fakeTransact(pool.client)), false)
    assert.ok(!pool.client.log.some(q => q.sql.includes('insert into')))
})

// ── buy - rejections ──────────────────────────────────────────────────────────

for (const [ reason, overrides, cmd ] of [
    [ 'unknown market'     , {}],
    [ 'ship unknown'       , { ...stocked() }],
    [ 'ship not docked here', { ...stocked(), ...dockedShip({ status: 'transit' }) }],
    [ 'ship not docked here', { ...stocked(), ...dockedShip({ stid: 'barnards.port' }) }],
    [ 'insufficient stock' , { ...stocked(5), ...dockedShip() }],
    [ 'over capacity'      , { ...stocked(), ...dockedShip(), COALESCE: () => ({ rows: [{ total: 15 }]}) }],
    [ 'price above limit'  , { ...stocked(), ...dockedShip(), ...noCargo }, buyCmd({ price_unit_max: 1 }) ],
]) {
    test(`buy rejects: ${ reason }`, async () => {
        const { client, fx } = handlers(overrides)
        await fx[ 'market.buy.requested.v1' ](cmd ?? buyCmd())

        const [ e ] = outboxEvents(client)
        assert.equal(e.event_type, 'market.trade.rejected.v1')
        assert.equal(e.payload.reason, reason)
        assert.equal(e.payload.side, 'buy')
        assert.ok(!client.log.some(q => q.sql.includes('INSERT INTO trades')), 'nothing reserved')
        assert.ok(!client.log.some(q => q.sql.includes('UPDATE station_inventory')), 'stock untouched')
    })
}

// ── buy - reserve ─────────────────────────────────────────────────────────────

test('buy reserves stock, records the trade, requests the debit', async () => {
    const { client, fx } = handlers({ ...stocked(), ...dockedShip(), ...noCargo })
    await fx[ 'market.buy.requested.v1' ](buyCmd())

    const bump = client.log.find(q => q.sql.includes('UPDATE station_inventory'))
    assert.equal(bump.params[ 2 ], -10, 'stock reserved')

    const insert = client.log.find(q => q.sql.includes('INSERT INTO trades'))
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

test('sell rejects: insufficient cargo', async () => {
    const { client, fx } = handlers({
        ...stocked(40),
        ...dockedShip({ stid: 'barnards.port' }),
        'SELECT quantity': () => ({ rows: [{ quantity: 3 }]}),
    })
    await fx[ 'market.sell.requested.v1' ](sellCmd())

    const [ e ] = outboxEvents(client)
    assert.equal(e.event_type, 'market.trade.rejected.v1')
    assert.equal(e.payload.reason, 'insufficient cargo')
    assert.equal(e.payload.side, 'sell')
})

test('sell rejects: price below limit', async () => {
    const { client, fx } = handlers({
        ...stocked(160), // glut → cheap
        ...dockedShip({ stid: 'barnards.port' }),
        'SELECT quantity': () => ({ rows: [{ quantity: 10 }]}),
    })
    await fx[ 'market.sell.requested.v1' ](sellCmd({ price_unit_min: 500 }))

    const [ e ] = outboxEvents(client)
    assert.equal(e.payload.reason, 'price below limit')
})

test('sell hands over cargo, records the trade, requests the credit', async () => {
    const { client, fx } = handlers({
        ...stocked(40), // scarcity → good sell price
        ...dockedShip({ stid: 'barnards.port' }),
        'SELECT quantity': () => ({ rows: [{ quantity: 10 }]}),
    })
    await fx[ 'market.sell.requested.v1' ](sellCmd())

    const unload = client.log.find(q => q.sql.includes('UPDATE cargo'))
    assert.deepEqual(unload.params, [ 's1', 'ore', 10 ])

    const [ credit ] = outboxEvents(client)
    assert.equal(credit.command_type, 'wallet.credit.requested.v1')
    assert.match(credit.payload.rfid, /^trade_/)
    assert.ok(credit.payload.amount > 500, 'scarcity pays')
})

// ── continuation ──────────────────────────────────────────────────────────────

const pendingBuy = (over = {}) => ({
    'FROM trades': () => ({ rows: [{
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
    }]}),
})

const debited = { eid: 'evt-1', correlation_id: 'corr-test', payload: { pid: 'p1', rfid: 'trade_1', amount: 250.33, balance: 749.67 }}

test('wallet.debited settles the buy: cargo loaded, trade executed, quote republished', async () => {
    const { client, fx } = handlers({ ...pendingBuy(), ...stocked(150) })
    await fx[ 'wallet.debited.v1' ](debited)

    assert.ok(client.log.some(q => q.sql.includes('INSERT INTO cargo')), 'cargo loaded')
    const settle = client.log.find(q => q.sql.includes('UPDATE trades'))
    assert.deepEqual(settle.params, [ 'trade_1', 'executed' ])
    assert.ok(client.log.some(q => q.sql.includes('UPDATE markets')), 'quote board updated')

    const types = outboxEvents(client).map(e => e.event_type)
    assert.deepEqual(types, [ 'cargo.loaded.v1', 'market.trade.executed.v1', 'market.price.changed.v1' ])

    const executed = outboxEvents(client).find(e => e.event_type === 'market.trade.executed.v1')
    assert.equal(executed.payload.tid, 'trade_1')
    assert.equal(executed.payload.price_total, 250.33)
    assert.equal(executed.causation_id, 'evt-1')
})

test('wallet.credited settles the sell: stock restocked, cargo.unloaded emitted', async () => {
    const { client, fx } = handlers({
        ...pendingBuy({ side: 'sell', stid: 'barnards.port', price_unit: '108.10', price_total: '1081.01' }),
        'UPDATE station_inventory': () => ({ rows: [{ stock: 50, target: 100 }]}),
    })
    await fx[ 'wallet.credited.v1' ]({ ...debited, payload: { ...debited.payload, amount: 1081.01 }})

    const bump = client.log.find(q => q.sql.includes('UPDATE station_inventory'))
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
    const { client, fx } = handlers({ ...pendingBuy() })
    await fx[ 'wallet.credited.v1' ](debited)
    assert.equal(outboxEvents(client).length, 0)
})

// ── compensation ──────────────────────────────────────────────────────────────

test('wallet rejection on a buy releases the reserved stock', async () => {
    const { client, fx } = handlers({ ...pendingBuy() })
    await fx[ 'wallet.transaction.rejected.v1' ]({
        eid           : 'evt-2',
        correlation_id: 'corr-test',
        payload       : { pid: 'p1', rfid: 'trade_1', amount: 250.33, reason: 'insufficient funds' },
    })

    const bump = client.log.find(q => q.sql.includes('UPDATE station_inventory'))
    assert.equal(bump.params[ 2 ], 10, 'stock released')

    const settle = client.log.find(q => q.sql.includes('UPDATE trades'))
    assert.deepEqual(settle.params, [ 'trade_1', 'rejected' ])

    const [ e ] = outboxEvents(client)
    assert.equal(e.event_type, 'market.trade.rejected.v1')
    assert.equal(e.payload.reason, 'insufficient funds')
    assert.equal(e.payload.side, 'buy')
})

test('wallet rejection on a sell returns the cargo', async () => {
    const { client, fx } = handlers({ ...pendingBuy({ side: 'sell' }) })
    await fx[ 'wallet.transaction.rejected.v1' ]({
        eid           : 'evt-2',
        correlation_id: 'corr-test',
        payload       : { pid: 'p1', rfid: 'trade_1', amount: 1081.01, reason: 'wallet not found' },
    })

    const back = client.log.find(q => q.sql.includes('UPDATE cargo'))
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
    assert.match(ins.sql, /INSERT INTO ships/)
    assert.match(dep.sql, /SET status = 'transit'/)
    assert.match(arr.sql, /SET status = 'docked'/)
    assert.equal(arr.params[ 1 ], 'barnards.port')
})
