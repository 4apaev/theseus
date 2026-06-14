import assert from 'node:assert/strict'
import test   from 'node:test'

import { withClient, poll } from '#packages/util/src/index.js'

console.log('── PKG/UTIL', '─'.repeat(64))
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
