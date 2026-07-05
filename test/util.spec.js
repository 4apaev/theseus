import assert from 'node:assert/strict'
import test   from 'node:test'

import {
    withClient, poll,
    Query, where, selectWhere,
    formatTime, camel2snake,
    Raw, up, low, trim,
} from '#packages/util/src/index.js'

import '#packages/testing/src/index.js?title=🧪 🪏 UTIL'

// ── withClient ────────────────────────────────────────────────────────────────

test('withClient passes client to fn and releases it', async () => {
    let released = false
    const client = { release() { released = true } }
    const pool   = { connect: async () => client }

    const result = await withClient(pool, async c => {
        assert.equal(c, client)
        return 42
    })

    assert.equal(result, 42)
    assert.ok(released)
})

test('withClient releases client even when fn throws', async () => {
    let released = false
    const client = { release() { released = true } }
    const pool   = { connect: async () => client }

    await assert.rejects(
        () => withClient(pool, async () => { throw new Error('boom') }),
        /boom/,
    )

    assert.ok(released)
})

// ── poll ──────────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(ok => setTimeout(ok, ms))

test('poll fires fx immediately', async () => {
    let calls = 0
    const p = poll(async () => { calls++ }, 1000)
    await sleep(10)
    p.stop()
    assert.ok(calls >= 1)
})

test('poll reschedules fx after delay', async () => {
    let calls = 0
    const p = poll(async () => { calls++ }, 10)
    await sleep(45)
    p.stop()
    assert.ok(calls >= 3)
})

test('poll stop prevents further calls', async () => {
    let calls = 0
    const p = poll(async () => { calls++ }, 10)
    await sleep(5)
    p.stop()
    const snapshot = calls
    await sleep(50)
    assert.equal(calls, snapshot)
})

test('poll result reflects last fx return value', async () => {
    let n = 0
    const p = poll(async () => ++n, 10)
    await sleep(25)
    p.stop()
    assert.ok(p.result >= 1)
})

test('poll stop during fx prevents next tick', async () => {
    let calls = 0
    const p = poll(async () => {
        calls++
        await sleep(30)
    }, 5)
    await sleep(5)
    p.stop()
    await sleep(60)
    assert.equal(calls, 1)
})

// ── formatTime ────────────────────────────────────────────────────────────────

test('formatTime passes numbers through unchanged', () => {
    assert.equal(formatTime(5000), 5000)
})

test('formatTime parses bare number string as ms', () => {
    assert.equal(formatTime('100'), 100)
})

test('formatTime parses seconds', () => {
    assert.equal(formatTime('1s'), 1000)
    assert.equal(formatTime('30s'), 30000)
})

test('formatTime parses minutes', () => {
    assert.equal(formatTime('1m'), 60000)
    assert.equal(formatTime('5m'), 300000)
})

test('formatTime parses hours', () => {
    assert.equal(formatTime('2h'), 7200000)
})

// ── camel2snake ───────────────────────────────────────────────────────────────

test('camel2snake converts camelCase to snake_case', () => {
    assert.equal(camel2snake('playerCreated'), 'player_created')
    assert.equal(camel2snake('shipDeparted'),  'ship_departed')
    assert.equal(camel2snake('priceChanged'),  'price_changed')
    assert.equal(camel2snake('marketTradeExecuted', 'v1'),  'market_trade_executed_v1')
})

// ── Query ─────────────────────────────────────────────────────────────────────

const fakePool = { query: (text, vals) => ({ text, vals }) }

test('Query builds parameterized sql from tagged template', () => {
    const sql = Query(fakePool)
    const { text, vals } = sql`select * from players where pid = ${ 'abc' }`
    assert.equal(text, 'select * from players where pid = $1')
    assert.deepEqual(vals, [ 'abc' ])
})

test('Query deduplicates identical values', () => {
    const sql = Query(fakePool)
    const { text, vals } = sql`insert into foo values (${ 'x' }, ${ 'x' })`
    assert.equal(text, 'insert into foo values ($1, $1)')
    assert.deepEqual(vals, [ 'x' ])
})

test('Query handles multiple distinct params', () => {
    const sql = Query(fakePool)
    const { text, vals } = sql`update t set a = ${ 1 }, b = ${ 2 } where id = ${ 3 }`
    assert.equal(text, 'update t set a = $1, b = $2 where id = $3')
    assert.deepEqual(vals, [ 1, 2, 3 ])
})

// ── where ─────────────────────────────────────────────────────────────────────

test('where builds clause with table prefix', () => {
    const sid = 'abc', status = 'transit'
    const [ text, vals ] = where('ships', { sid, status })
    assert.match(text, /\n +where +ships.sid += +\$1\n +and +ships\.status += +\$2/)
    assert.deepEqual(vals, [ sid, status ])
})

test('where omits prefix when called without table', () => {
    const [ text, vals ] = where({ pid: 'xyz' })
    assert.match(text, /\n +where +pid += +\$1/)
    assert.deepEqual(vals, [ 'xyz' ])
})

test('where uses where/and keywords correctly', () => {
    const [ text, vals ] = where({ a: 1, b: 2, c: 3 })
    assert.match(text, /\n +where +a += +\$1\n +and +b += +\$2\n +and +c += +\$3/)
    assert.deepEqual(vals, [ 1,2,3 ])
})

// ── selectWhere ───────────────────────────────────────────────────────────────

test('selectWhere builds full select query', () => {
    const [ text, vals ] = selectWhere('players', { pid: 'abc' }, 'pid', 'handle')
    assert.match(text, /select +pid, +handle +from +players +\n +where +players\.pid += +\$1/)
    assert.deepEqual(vals, [ 'abc' ])
})

test('selectWhere defaults to select *', () => {
    const [ text, vals ] = selectWhere('players', { pid: 'abc' })
    assert.match(text, /select +\* +from +players +\n +where +players\.pid += +\$1/)
    assert.deepEqual(vals, [ 'abc' ])
})

// ── string helpers ────────────────────────────────────────────────────────────

test('Raw works as a tagged template', () => {
    assert.equal(Raw`a${ 1 }b${ 2 }`, 'a1b2')
})

test('Raw concatenates when called as a plain function', () => {
    assert.equal(Raw('x', [ 1, 2 ]), 'x12')
})

test('up / low / trim', () => {
    assert.equal(up('abc'), 'ABC')
    assert.equal(low('ABC'), 'abc')
    assert.equal(trim('  x  '), 'x')
})
