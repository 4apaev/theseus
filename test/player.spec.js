import assert from 'node:assert/strict'
import test   from 'node:test'

import { createHandlers       } from '#apps/player-service/src/handlers.js'
import { hash, verify } from '#apps/player-service/src/crypto.js'

console.log('\n── APP/PLAYER %s\n', '─'.repeat(64))

// ── helpers ──────────────────────────────────────────────────────────────────

function fakeClient(overrides = {}) {
    const log = []
    return {
        log,
        release() {},
        async query(sql, params) {

            log.push({
                sql: sql.trim(),
                params,
            })

            for (const [ match, fx ] of Object.entries(overrides))
                if (sql.includes(match)) return fx(params)
            return { rows: []}
        },
    }
}

const fakeTransact = client => (pool, fn) => fn(client)

function outboxEvents(client) {
    return client.log
        .filter(({ sql }) => sql.includes('insert into outbox'))
        .map(({ params }) => JSON.parse(params[ 3 ]))
}

function makeCmd(payload, extra = {}) {
    return {
        cmd           : 'cmd-test',
        correlation_id: 'corr-test',
        payload,
        ...extra,
    }
}

// ── registerPlayer ───────────────────────────────────────────────────────────

test('registerPlayer inserts player and wallet', async () => {
    const client   = fakeClient()
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'player.register.requested.v1' ](makeCmd({
        handle  : 'alice',
        password: 'secret',
    }))

    assert.ok(client.log.find(({ sql }) => sql.includes('insert into players')))
    assert.ok(client.log.find(({ sql }) => sql.includes('insert into wallets')))
})

test('registerPlayer emits player.created and wallet.created', async () => {
    const client   = fakeClient()
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'player.register.requested.v1' ](makeCmd({
        handle  : 'alice',
        password: 'secret',
    }))
    const events = outboxEvents(client).map(e => e.event_type)

    assert.ok(events.includes('player.created.v1'))
    assert.ok(events.includes('wallet.created.v1'))
})

test('registerPlayer sets correct handle and starter balance', async () => {
    const client   = fakeClient()
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'player.register.requested.v1' ](makeCmd({
        handle  : 'alice',
        password: 'secret',
    }))

    const events  = outboxEvents(client)
    const created = events.find(e => e.event_type === 'player.created.v1')
    const wallet  = events.find(e => e.event_type === 'wallet.created.v1')

    assert.equal(created.payload.handle, 'alice')
    assert.ok(wallet.payload.balance > 0)
    assert.equal(created.payload.pid, wallet.payload.pid)
})

test('registerPlayer sets causation_id from cmd', async () => {
    const client   = fakeClient()
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'player.register.requested.v1' ](
        makeCmd({ handle: 'alice', password: 'secret' }),
    )

    const events = outboxEvents(client)
    assert.ok(events.every(e => e.causation_id === 'cmd-test'))
})

test('registerPlayer emits registration.rejected on duplicate handle', async () => {
    const client = fakeClient({
        'insert into players'() {
            const e = new Error('unique violation')
            e.code = '23505'
            throw e
        },
    })
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'player.register.requested.v1' ](
        makeCmd({ handle: 'alice', password: 'secret' }),
    )

    const events = outboxEvents(client)
    assert.equal(events.length, 1)
    assert.equal(events[ 0 ].event_type, 'player.registration.rejected.v1')
    assert.equal(events[ 0 ].payload.handle, 'alice')
    assert.equal(events[ 0 ].payload.reason, 'handle taken')
})

test('registerPlayer rethrows non-23505 errors', async () => {
    const client = fakeClient({
        'insert into players'() { throw new Error('connection lost') },
    })
    const handlers = createHandlers({}, fakeTransact(client))

    await assert.rejects(
        () => handlers[ 'player.register.requested.v1' ](makeCmd({ handle: 'alice', password: 'secret' })),
        /connection lost/,
    )
})

// ── debitWallet ───────────────────────────────────────────────────────────────

const claimedRfid = { wallet_transactions: () => ({ rows: [{ rfid: 'r1' }]}) }

test('debitWallet emits wallet.debited with updated balance', async () => {
    const client = fakeClient({
        ...claimedRfid,
        'select balance': () => ({ rows: [{ balance: 500, version: 2 }]}),
        'update wallets': () => ({ rows: [{ balance: 400, version: 3 }]}),
    })
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'wallet.debit.requested.v1' ](
        makeCmd({ pid: 'p1', rfid: 'r1', amount: 100, reason: 'purchase' }),
    )

    const events = outboxEvents(client)
    assert.equal(events.length, 1)
    assert.equal(events[ 0 ].event_type, 'wallet.debited.v1')
    assert.equal(events[ 0 ].payload.balance, 400)
    assert.equal(events[ 0 ].payload.amount, 100)
})

test('debitWallet emits transaction.rejected on insufficient funds', async () => {
    const client = fakeClient({
        ...claimedRfid,
        'select balance': () => ({ rows: [{ balance: 50, version: 1 }]}),
    })
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'wallet.debit.requested.v1' ](
        makeCmd({ pid: 'p1', rfid: 'r1', amount: 100, reason: 'purchase' }),
    )

    const events = outboxEvents(client)
    assert.equal(events[ 0 ].event_type, 'wallet.transaction.rejected.v1')
    assert.equal(events[ 0 ].payload.reason, 'insufficient funds')
    assert.ok(!client.log.find(({ sql }) => sql.includes('update wallets')))
})

test('debitWallet emits transaction.rejected when wallet not found', async () => {
    const client = fakeClient({
        ...claimedRfid,
        'select balance': () => ({ rows: []}),
    })
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'wallet.debit.requested.v1' ](
        makeCmd({ pid: 'p1', rfid: 'r1', amount: 100, reason: 'purchase' }),
    )

    const events = outboxEvents(client)
    assert.equal(events[ 0 ].event_type, 'wallet.transaction.rejected.v1')
    assert.equal(events[ 0 ].payload.reason, 'wallet not found')
})

test('debitWallet skips silently on duplicate rfid', async () => {
    const client   = fakeClient({ wallet_transactions: () => ({ rows: []}) })
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'wallet.debit.requested.v1' ](
        makeCmd({ pid: 'p1', rfid: 'r1', amount: 100 }),
    )

    assert.equal(outboxEvents(client).length, 0)
    assert.ok(!client.log.find(({ sql }) => sql.includes('select balance')))
})

// ── creditWallet ──────────────────────────────────────────────────────────────

test('creditWallet emits wallet.credited with updated balance', async () => {
    const client = fakeClient({
        ...claimedRfid,
        'update wallets': () => ({ rows: [{ balance: 600, version: 2 }]}),
    })
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'wallet.credit.requested.v1' ](
        makeCmd({ pid: 'p1', rfid: 'r1', amount: 100, reason: 'reward' }),
    )

    const events = outboxEvents(client)
    assert.equal(events.length, 1)
    assert.equal(events[ 0 ].event_type, 'wallet.credited.v1')
    assert.equal(events[ 0 ].payload.balance, 600)
    assert.equal(events[ 0 ].payload.amount, 100)
})

test('creditWallet sets causation_id from cmd', async () => {
    const client = fakeClient({
        ...claimedRfid,
        'update wallets': () => ({ rows: [{ balance: 600, version: 2 }]}),
    })
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'wallet.credit.requested.v1' ](
        makeCmd({ pid: 'p1', rfid: 'r1', amount: 100, reason: 'reward' }),
    )

    const [ event ] = outboxEvents(client)
    assert.equal(event.causation_id, 'cmd-test')
})

test('creditWallet skips silently on duplicate rfid', async () => {
    const client   = fakeClient({ wallet_transactions: () => ({ rows: []}) })
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'wallet.credit.requested.v1' ](
        makeCmd({ pid: 'p1', rfid: 'r1', amount: 100 }),
    )

    assert.equal(outboxEvents(client).length, 0)
    assert.ok(!client.log.find(({ sql }) => sql.includes('update wallets')))
})

// ── crypto ────────────────────────────────────────────────────────────────────

test('hash returns salt:hex string', async () => {
    const h = await hash('secret')
    assert.match(h, /^[a-f0-9]+:[a-f0-9]+$/)
})

test('hash produces different output each call (unique salt)', async () => {
    const [ a, b ] = await Promise.all([ hash('secret'), hash('secret') ])
    assert.notEqual(a, b)
})

test('verify returns true for correct password', async () => {
    const psw = 'correct'
    const hsh = await hash(psw)
    assert.equal(await verify(psw, hsh), true)
})

test('verify returns false for wrong password', async () => {
    const h = await hash('correct')
    assert.equal(await verify('wrong', h), false)
})
