import test   from 'node:test'
import assert from 'node:assert/strict'
import Crypto from 'node:crypto'
import { setTimeout } from 'node:timers/promises'

import { DB }                                       from '@theseus/db'
import { Query }                                    from '@theseus/util'
import { Codec, createProducer, createMemoryKafka } from '@theseus/kafka'

import {
    eventTree as EVT,
    commandTree as CMD,
    createCommandEnvelope,
} from '@theseus/contracts'

import startPlayer from '#apps/player-service/src/main.js'

// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── INTEGRATION/PLAYER %s\n', '─'.repeat(60))

// ── helpers ──────────────────────────────────────────────────────────────────

async function waitFor(fx, ms = 5000, interval = 50) {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
        const rs = await fx()
        if (rs) return rs
        await setTimeout(interval)
    }
    throw new Error('waitFor timed out')
}

function publish(type, payload) {
    return producer.publishCommand(createCommandEnvelope({
        cmd         : Crypto.randomUUID(),
        command_type: type,
        requested_by: 'integration-test',
        payload,
    }))
}

function collectEvents(kafka, topics) {
    const events = []
    const sub = kafka.subscribe({
        topics,
        groupId: 'test-' + Crypto.randomUUID(),
        handler(msg) {
            return events.push(Codec.decode(msg.value))
        },
    })
    return {
        events,
        stop() { return sub.stop() },
    }
}

function guid() {
    return 'itg_' + Crypto.randomUUID().slice(0, 8)
}

// ── fixtures ─────────────────────────────────────────────────────────────────

let kafka, service, producer, pool, sql

test.before(async () => {
    kafka    = createMemoryKafka()
    pool     = DB.create()
    producer = createProducer({ client: kafka })
    service  = await startPlayer(kafka)
    sql = (...a) => Query(pool)(...a).then(r => r.rows[ 0 ])
})

test.after(() => {
    service?.stop()
    pool?.end()
})

// ── tests ────────────────────────────────────────────────────────────────────

test('registerPlayer - creates player & wallet, emits player.created & wallet.created', async () => {
    const handle = guid()
    const { events, stop } = collectEvents(kafka, [ 'events.player', 'events.wallet' ])

    await publish(CMD.player.register.requested, { handle, password: 'secret' })
    await waitFor(() => events.length >= 2)
    stop()

    const types = events.map(e => e.event_type)

    assert.ok(types.includes(EVT.player.created), EVT.player.created + ' emitted')
    assert.ok(types.includes(EVT.wallet.created), EVT.wallet.created + ' emitted')

    const epc = events.find(e => e.event_type === EVT.player.created)
    const ewc = events.find(e => e.event_type === EVT.wallet.created)

    assert.equal(epc.payload.handle, handle)

    assert.equal(+ewc.payload.balance, 1000)
    assert.equal(ewc.payload.pid, epc.payload.pid)

    const player = await sql`select * from players where handle = ${ handle }`
    const wallet = await sql`select * from wallets where pid    = ${ player.pid }`

    assert.equal(player.handle, handle)
    assert.equal(+wallet.balance, 1000)
})

test('registerPlayer - duplicate handle emits registration.rejected', async () => {
    const handle = guid()

    await publish(CMD.player.register.requested, { handle, password: 'x' })

    const { events, stop } = collectEvents(kafka, [ 'events.player' ])
    await publish(CMD.player.register.requested, { handle, password: 'x' })

    const prFail = e => e.event_type === EVT.player.registration.rejected
    await waitFor(() => events.some(prFail))
    stop()

    const { payload } = events.find(prFail)
    assert.equal(payload.handle, handle)
    assert.equal(payload.reason, 'handle taken')
})

test('debitWallet - updates balance, emits wallet.debited', async () => {
    const handle = guid()
    await publish(CMD.player.register.requested, { handle, password: 'x' })

    // DB write is synchronous with publishCommand (memory kafka)
    const { pid } = await sql`select pid from players where handle = ${ handle }`

    const { events, stop } = collectEvents(kafka, [ 'events.wallet' ])
    await publish(CMD.wallet.debit.requested, {
        pid,
        rfid  : Crypto.randomUUID(),
        amount: 100,
        reason: 'purchase',
    })

    const debited = e => e.event_type === EVT.wallet.debited
    await waitFor(() => events.some(debited))
    stop()

    const { payload } = events.find(debited)
    assert.equal(+payload.balance, 900)
    assert.equal(+payload.amount, 100)

    const wallet = await sql`select balance from wallets where pid = ${ pid }`
    assert.equal(+wallet.balance, 900)
})

test('debitWallet - insufficient funds emits transaction.rejected', async () => {
    const handle = guid()

    await publish(CMD.player.register.requested, { handle, password: 'x' })
    const { pid } = await sql`select pid from players where handle = ${ handle }`

    const { events, stop } = collectEvents(kafka, [ 'events.wallet' ])

    await publish(CMD.wallet.debit.requested, {
        pid,
        rfid  : Crypto.randomUUID(),
        amount: 9999,
        reason: 'too much',
    })

    const trFail = e => e.event_type === EVT.wallet.transaction.rejected
    await waitFor(() => events.some(trFail))
    stop()

    const { payload } = events.find(trFail)
    assert.equal(payload.reason, 'insufficient funds')

    const wallet = await sql`select balance from wallets where pid = ${ pid }`
    assert.equal(+wallet.balance, 1000, 'balance unchanged')
})

test('creditWallet - updates balance, emits wallet.credited', async () => {
    const handle = guid()
    await publish(CMD.player.register.requested, { handle, password: 'x' })

    const credited = e => e.event_type === EVT.wallet.credited

    const { pid } = await sql`select pid from players where handle = ${ handle }`
    const { events, stop } = collectEvents(kafka, [ 'events.wallet' ])

    await publish(CMD.wallet.credit.requested, {
        pid,
        rfid  : Crypto.randomUUID(),
        amount: 500,
        reason: 'reward',
    })

    await waitFor(() => events.some(credited))
    stop()

    const { payload } = events.find(credited)
    assert.equal(+payload.balance, 1500)

    const wallet = await sql`select balance from wallets where pid = ${ pid }`
    assert.equal(+wallet.balance, 1500)
})

test('debitWallet - duplicate rfid is silently ignored', async () => {
    const handle = guid()
    await publish(CMD.player.register.requested, { handle, password: 'x' })

    const { pid } = await sql`select pid from players where handle = ${ handle }`
    const cmd = {
        pid,
        rfid  : Crypto.randomUUID(),
        amount: 100,
        reason: 'purchase',
    }

    // first debit
    await publish(CMD.wallet.debit.requested, cmd)

    await waitFor(async () => {
        const { balance } = await sql`select balance from wallets where pid = ${ pid }`
        return +balance === 900
    })

    // replay - same rfid
    await publish(CMD.wallet.debit.requested, cmd)

    await setTimeout(1200) // wait > outbox interval
    const { balance } = await sql`select balance from wallets where pid = ${ pid }`
    assert.equal(+balance, 900, 'balance unchanged on replay')
})
