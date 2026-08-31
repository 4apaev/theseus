import pg     from 'pg'
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
import {
    withClient, Query,
    where, selectWhere,
} from '#packages/db/src/query.js'
import { encodeJson, Fail } from '#packages/util/src/index.js'

import {
    fakePool,
    fakeClient,
} from '#packages/testing/src/index.js'

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
    assert.equal(Inbox.identity({}), void 0)
    assert.equal(Inbox.identity(null), void 0)
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
    const pool = fakePool([ () => ({ rows: [{}]}) ])
    assert.equal(await createInbox(pool).has('e1'), true)
})

test('createInbox.has returns false when row absent', async () => {
    assert.equal(await createInbox(fakePool()).has('e1'), false)
})

test('createInbox.mark inserts row and returns true', async () => {
    const pool = fakePool()
    assert.equal(await createInbox(pool).mark('e1'), true)
    assert.ok(pool.client.log.some(q => q.sql.includes('INSERT INTO inbox')))
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
    assert.equal(client.log.filter(q => q.sql.includes('INSERT INTO outbox')).length, 2)
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

    const pool = fakePool([
        () => ({ rows: pending.splice(0) }),
        p => { marked.push(p[ 0 ]); return { rows: []} },
    ])

    const poller = pollOutbox(pool, async rec => published.push(rec), { interval: 5 })
    await setTimeout(20)
    poller.stop()

    assert.equal(published[ 0 ].topic, 'events.player')
    assert.ok(marked.includes('r1'))
})

test('pollOutbox marks row only after publish succeeds', async () => {
    const order = []
    const pending = [{ id: 'r1', topic: 't', key: null, payload: {}}]

    const pool = fakePool([
        () => ({ rows: pending.splice(0) }),
        () => { order.push('mark'); return { rows: []} },
    ])

    const poller = pollOutbox(pool, async () => { order.push('publish') }, { interval: 100 })
    await setTimeout(20)
    poller.stop()

    assert.deepEqual(order, [ 'publish', 'mark' ])
})

test('pollOutbox stop prevents further polling', async () => {
    let fetches = 0
    const pool = fakePool([
        () => { fetches++; return { rows: []} },
    ])
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
    assert.ok(log.some(q => q.sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')))
    assert.ok(log.some(q => q.sql.includes('INSERT INTO schema_migrations') && q.params))
})

test('migrate skips already-applied files', async () => {
    const pool = fakePool([
        () => ({ rows: []}),                                 // bootstrap
        () => ({ rows: [{ name: '001_inbox.sql' }]}),         // appliedMigrations
    ])
    await migrate(pool)
    const applied = pool.client.log
        .filter(q => q.sql.includes('INSERT INTO schema_migrations') && q.params)
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
                return Fail.deny('syntax error')
            return Promise.resolve({ rows: []})
        },
    }
    const pool = { connect: () => Promise.resolve(client) }

    await assert.rejects(() => migrate(pool), /syntax error/)
    assert.ok(log.includes('ROLLBACK'))
})

// ── pool ──────────────────────────────────────────────────────────────────────

test('withTransaction commits and returns the fn result', async () => {
    const pool = fakePool()
    const rs   = await withTransaction(pool, async () => 42)

    assert.equal(rs, 42)
    const sqls = pool.client.log.map(q => q.sql)
    assert.ok(sqls.includes('BEGIN'))
    assert.ok(sqls.includes('COMMIT'))
    assert.ok(!sqls.includes('ROLLBACK'))
})

test('withTransaction rolls back when fn throws', async () => {
    const pool = fakePool()
    await assert.rejects(
        () => withTransaction(pool, async () => { throw new Fail('boom') }),
        /boom/,
    )
    const sqls = pool.client.log.map(q => q.sql)
    assert.ok(sqls.includes('ROLLBACK'))
    assert.ok(!sqls.includes('COMMIT'))
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

test('naive `timestamp` columns (oid 1114) parse as utc regardless of host tz', () => {
    // every service writes these via Date#toISOString() (always utc) - the
    // driver must read them back the same way, or a non-utc host silently
    // shifts every timestamp by its own utc offset
    const parsed = pg.types.getTypeParser(1114)('2026-07-22 02:54:22.802')
    assert.equal(parsed.toISOString(), '2026-07-22T02:54:22.802Z')
})

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

// ── Query ─────────────────────────────────────────────────────────────────────

const queryPool = { query: (text, vals) => ({ text, vals }) }

test('Query builds parameterized sql from tagged template', () => {
    const sql = Query(queryPool)
    const { text, vals } = sql`select * from players where pid = ${ 'abc' }`
    assert.equal(text, 'select * from players where pid = $1')
    assert.deepEqual(vals, [ 'abc' ])
})

test('Query deduplicates identical values', () => {
    const sql = Query(queryPool)
    const { text, vals } = sql`insert into foo values (${ 'x' }, ${ 'x' })`
    assert.equal(text, 'insert into foo values ($1, $1)')
    assert.deepEqual(vals, [ 'x' ])
})

test('Query handles multiple distinct params', () => {
    const sql = Query(queryPool)
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
