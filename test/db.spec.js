import assert from 'node:assert/strict'
import test   from 'node:test'
import { setTimeout }   from 'node:timers/promises'

import inbox, {
    Inbox,
    createInbox,
} from '#packages/db/src/inbox.js'

import outbox, {
    writeOutbox,
    pollOutbox,
} from '#packages/db/src/outbox.js'

import migrate from '#packages/db/src/migrate.js'
import { createPool, withTransaction } from '#packages/db/src/pool.js'
import { encodeJson } from '#packages/util/src/index.js'

import {
    fakePool,
    fakeClient,
} from '#packages/testing/src/index.js?title=🧪 📇 DB'

// ── Inbox (memory) ────────────────────────────────────────────────────────────

test('Inbox mark and has', () => {
    const box = new Inbox
    assert.ok(box instanceof Set)
    assert.equal(box.mark('e1'), true)
    assert.ok(box.has('e1'))
    assert.ok(!box.has('e2'))
})

test('Inbox.identity extracts eid then cmd', () => {
    assert.equal(Inbox.identity({ eid: 'e1', cmd: 'c1' }), 'e1')
    assert.equal(Inbox.identity({ cmd: 'c1' }), 'c1')
    assert.equal(Inbox.identity({}), undefined)
    assert.equal(Inbox.identity(null), undefined)
})

test('Inbox toStringTag', () => {
    assert.equal(toString.call(new Inbox), '[object Inbox]')
})

test('Inbox.of returns Inbox instance', () => {
    assert.ok(Inbox.of() instanceof Inbox)
})

test('createMemoryInbox returns an Inbox', () => {
    assert.ok(inbox.memory() instanceof Inbox)
})

test('inbox default export groups factory functions', () => {
    assert.equal(typeof inbox.memory, 'function')
    assert.equal(typeof inbox.create, 'function')
})

// ── createInbox (pool-backed) ─────────────────────────────────────────────────

test('createInbox.has returns true when row found', async () => {
    const pool = fakePool({ 'select 1 from inbox': () => ({ rows: [{}]}) })
    assert.equal(await createInbox(pool).has('e1'), true)
})

test('createInbox.has returns false when row absent', async () => {
    assert.equal(await createInbox(fakePool()).has('e1'), false)
})

test('createInbox.mark inserts row and returns true', async () => {
    const pool = fakePool()
    assert.equal(await createInbox(pool).mark('e1'), true)
    assert.ok(pool.client.log.some(q => q.sql.includes('insert into inbox')))
})

// ── writeOutbox ───────────────────────────────────────────────────────────────

test('writeOutbox inserts one row per message', async () => {
    const client = fakeClient()
    await writeOutbox(client, [{
        topic   : 'events.player',
        messages: [
            { key: 'p1', value: encodeJson({ eid: 'e1' }) },
            { key: 'p2', value: encodeJson({ eid: 'e2' }) },
        ],
    }])
    assert.equal(client.log.filter(q => q.sql.includes('insert into outbox')).length, 2)
})

test('writeOutbox decodes Buffer values for jsonb storage', async () => {
    const client = fakeClient()
    await writeOutbox(client, [{ topic: 't', messages: [{ key: 'k', value: encodeJson({ x: 1 }) }]}])
    assert.ok(client.log[ 0 ].params[ 3 ].includes('"x":1'))
})

test('writeOutbox accepts plain object values', async () => {
    const client = fakeClient()
    await writeOutbox(client, [{ topic: 't', messages: [{ key: 'k', value: { x: 2 }}]}])
    assert.ok(client.log[ 0 ].params[ 3 ].includes('"x":2'))
})

test('writeOutbox coerces missing key to null', async () => {
    const client = fakeClient()
    await writeOutbox(client, [{ topic: 't', messages: [{ value: encodeJson({}) }]}])
    assert.equal(client.log[ 0 ].params[ 2 ], null)
})

// ── pollOutbox ────────────────────────────────────────────────────────────────

test('pollOutbox publishes pending rows then marks them', async () => {
    const pending = [{ id: 'r1', topic: 'events.player', key: 'p1', payload: { eid: 'e1' }}]
    const published = []
    const marked    = []

    const pool = fakePool({
        'where published is null': () => ({ rows: pending.splice(0) }),
        'update outbox'(p) { marked.push(p[ 0 ]); return { rows: []} },
    })

    const poller = pollOutbox(pool, async rec => published.push(rec), { interval: 5 })
    await setTimeout(20)
    poller.stop()

    assert.equal(published[ 0 ].topic, 'events.player')
    assert.ok(marked.includes('r1'))
})

test('pollOutbox marks row only after publish succeeds', async () => {
    const order = []
    const pending = [{ id: 'r1', topic: 't', key: null, payload: {}}]

    const pool = fakePool({
        'where published is null': () => ({ rows: pending.splice(0) }),
        'update outbox'() { order.push('mark'); return { rows: []} },
    })

    const poller = pollOutbox(pool, async () => { order.push('publish') }, { interval: 100 })
    await setTimeout(20)
    poller.stop()

    assert.deepEqual(order, [ 'publish', 'mark' ])
})

test('pollOutbox stop prevents further polling', async () => {
    let fetches = 0
    const pool = fakePool({
        'where published is null'() { fetches++; return { rows: []} },
    })
    const poller = pollOutbox(pool, async () => {}, { interval: 10 })
    await setTimeout(5)
    poller.stop()
    const snapshot = fetches
    await setTimeout(50)
    assert.equal(fetches, snapshot)
})

test('outbox default export groups write and poll', () => {
    assert.equal(typeof outbox.write, 'function')
    assert.equal(typeof outbox.poll,  'function')
})

// ── migrate ───────────────────────────────────────────────────────────────────

test('migrate bootstraps schema_migrations and applies pending files', async () => {
    const pool = fakePool()
    await migrate(pool)
    const { log } = pool.client
    assert.ok(log.some(q => q.sql.includes('create table if not exists schema_migrations')))
    assert.ok(log.some(q => q.sql.includes('insert into schema_migrations') && q.params))
})

test('migrate skips already-applied files', async () => {
    const pool = fakePool({
        'select name from schema_migrations': () => ({ rows: [{ name: '001_inbox.sql' }]}),
    })
    await migrate(pool)
    const applied = pool.client.log
        .filter(q => q.sql.includes('insert into schema_migrations') && q.params)
        .map(q => q.params[ 0 ])
    assert.ok(!applied.includes('001_inbox.sql'))
    assert.ok(applied.includes('002_outbox.sql'))
})

test('migrate rolls back on sql error', async () => {
    const log = []
    const client = {
        release() {},
        query(sql) {
            log.push(sql.trim())
            if (sql.includes('create table inbox'))
                return Promise.reject(new Error('syntax error'))
            return Promise.resolve({ rows: []})
        },
    }
    const pool = { connect: () => Promise.resolve(client) }

    await assert.rejects(() => migrate(pool), /syntax error/)
    assert.ok(log.includes('rollback'))
})

// ── pool ──────────────────────────────────────────────────────────────────────

test('withTransaction commits and returns the fn result', async () => {
    const pool = fakePool()
    const rs   = await withTransaction(pool, async () => 42)

    assert.equal(rs, 42)
    const sqls = pool.client.log.map(q => q.sql)
    assert.ok(sqls.includes('begin'))
    assert.ok(sqls.includes('commit'))
    assert.ok(!sqls.includes('rollback'))
})

test('withTransaction rolls back when fn throws', async () => {
    const pool = fakePool()
    await assert.rejects(
        () => withTransaction(pool, async () => { throw new Error('boom') }),
        /boom/,
    )
    const sqls = pool.client.log.map(q => q.sql)
    assert.ok(sqls.includes('rollback'))
    assert.ok(!sqls.includes('commit'))
})

test('createPool sets search_path option and remembers the schema', async () => {
    Object.assign(process.env, { PG_HOST: 'localhost', PG_PORT: '5432', PG_USER: 'u', PG_PASS: 'p', PG_DB: 'd' })

    const pool = createPool({ schema: 'spec' })
    assert.equal(pool.schema, 'spec')
    assert.equal(pool.options.options, '-c search_path=spec')
    await pool.end()
})

test('createPool without schema leaves search_path alone', async () => {
    const pool = createPool()
    assert.equal(pool.schema, undefined)
    assert.equal(pool.options.options, undefined)
    await pool.end()
})
