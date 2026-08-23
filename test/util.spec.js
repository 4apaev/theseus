import assert from 'node:assert/strict'
import test   from 'node:test'

import {
    poll,
    formatTime, camel2snake,
    Raw, up, low, trim, guid,
} from '#packages/util/src/index.js'

import '#packages/testing/src/index.js?title=🧪 🪏 UTIL'

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

test('poll survives a failing tick and keeps going', async () => {
    const seen = []
    const err  = console.error
    console.error = () => {}          // the catch logs. keep the run quiet.

    try {
        const poller = poll(() => {
            seen.push(1)
            if (seen.length === 1) throw new Error('one bad tick')
            return seen.length
        }, 10)

        await sleep(45)
        poller.stop()
        assert.ok(seen.length >= 3, `the loop kept running: ${ seen.length } ticks`)
        assert.ok(poller.result >= 2, 'and later results still land')
    }
    finally {
        console.error = err
    }
})

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

// ── guid ──────────────────────────────────────────────────────────────────────

test('guid joins prefix with underscore, bare uuid without', () => {
    assert.match(guid('trade'), /^trade_[0-9a-f-]{36}$/)
    assert.match(guid(), /^[0-9a-f-]{36}$/)
    assert.notEqual(guid(), guid())
})
