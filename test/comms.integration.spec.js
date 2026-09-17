import test   from 'node:test'
import assert from 'node:assert/strict'
import Crypto from 'node:crypto'

import { DB, Query } from '@theseus/db'
import * as Kfk      from '@theseus/kafka'

import {
    guid,
    waitFor,
    collectEvents,
    createPublisher,
    wherePayload,
} from '#packages/testing/src/index.js'

import {
    eventTree as EVT,
    commandTree as CMD,
    createEventEnvelope,
} from '@theseus/contracts'

import start from '@theseus/comms-service'

const PRFX = 'itg_comms'

const WITH_ANSIBLE = [{ slot: 'utility1', gid: 'ansible.mk1' }]
const NO_ANSIBLE   = []

// ── helpers ──────────────────────────────────────────────────────────────────

function shipCreated(sid, pid, stid, fitted) {
    return producer.publishEvent(createEventEnvelope({
        eid              : Crypto.randomUUID(),
        event_type       : EVT.ship.created,
        aggregate_id     : sid,
        aggregate_type   : 'ship',
        aggregate_version: 1,
        producer         : 'integration-test',
        payload          : {
            sid, pid, stid, fitted,
            name: 'far treasure', capacity: 20, velocity: 0.6, acceleration: 0.002,
            hull: 'starter', rig: 1, power: 2, power_pool: 8,
        },
    }))
}

function shipDeparted(sid, pid) {
    const now = (new Date).toISOString()
    return producer.publishEvent(createEventEnvelope({
        eid              : Crypto.randomUUID(),
        event_type       : EVT.ship.departed,
        aggregate_id     : sid,
        aggregate_type   : 'ship',
        aggregate_version: 1,
        producer         : 'integration-test',
        payload          : {
            sid, pid, from: 'sol.outpost', to: 'sol.mars',
            departed: now, arrives: now, years_abs: 0.1, years_rel: 0.1,
        },
    }))
}

// ── fixtures ─────────────────────────────────────────────────────────────────

let kafka, service, pool, sql, publish, producer

test.before(async () => {
    kafka    = Kfk.createMemoryKafka()
    pool     = DB.create({ schema: 'comms' })
    producer = Kfk.createProducer({ client: kafka })
    publish  = createPublisher(producer)
    service  = await start(kafka)
    sql = (...a) => Query(pool)(...a).then(r => r.rows[ 0 ])
})

test.after(() => {
    service?.stop()
    pool?.end()
})

// ── tests ────────────────────────────────────────────────────────────────────

test('station chat reaches instantly, delivered at send time', async () => {
    const sid = guid(PRFX), pid = guid(PRFX)
    await shipCreated(sid, pid, 'sol.outpost', WITH_ANSIBLE)

    const { events, stop } = collectEvents(kafka, [ 'events.comms' ])
    await publish(CMD.comms.send.requested, { pid, body: 'hello sol' })

    const sent = await wherePayload(events, EVT.message.sent, { from: pid })
    stop()

    assert.equal(sent.payload.stid, 'sol.outpost')
    assert.equal(sent.payload.deliver, sent.payload.sent, 'no delay')

    const row = await sql`select * from messages where "from" = ${ pid }`
    assert.equal(row.delivered.toISOString(), row.sent.toISOString())
})

test('station chat rejects a ship in transit', async () => {
    const sid = guid(PRFX), pid = guid(PRFX)
    await shipCreated(sid, pid, 'sol.outpost', WITH_ANSIBLE)
    await shipDeparted(sid, pid)

    const { events, stop } = collectEvents(kafka, [ 'events.comms' ])
    await publish(CMD.comms.send.requested, { pid, body: 'anyone there?' })

    const rejected = await wherePayload(events, EVT.message.send.rejected, { pid })
    stop()

    assert.equal(rejected.payload.reason, 'not docked anywhere')
})

test('an ansible message across stations delivers only after its computed delay', async () => {
    const sid1 = guid(PRFX), pid1 = guid(PRFX)
    const sid2 = guid(PRFX), pid2 = guid(PRFX)
    await shipCreated(sid1, pid1, 'sol.outpost', WITH_ANSIBLE)
    await shipCreated(sid2, pid2, 'alpha.exchange', WITH_ANSIBLE)

    const { events, stop } = collectEvents(kafka, [ 'events.comms' ])
    await publish(CMD.comms.send.requested, { pid: pid1, to: pid2, body: 'hello from sol' })

    const sent = await wherePayload(events, EVT.message.sent, { from: pid1, to: pid2 })
    assert.ok(new Date(sent.payload.deliver) > new Date(sent.payload.sent), 'a real distance takes real time')

    const delivered = await wherePayload(events, EVT.message.delivered, { mid: sent.payload.mid }, '15s')
    stop()

    assert.equal(delivered.payload.to, pid2)

    const row = await sql`select delivered from messages where mid = ${ sent.payload.mid }`
    assert.ok(row.delivered, 'persisted as delivered')
})

test('an ansible message sends while the sender is in transit, from its nearer end', async () => {
    const sid1 = guid(PRFX), pid1 = guid(PRFX)
    const sid2 = guid(PRFX), pid2 = guid(PRFX)

    await shipCreated(sid1 , pid1, 'sol.outpost', WITH_ANSIBLE)
    await shipDeparted(sid1, pid1) // sol.outpost -> sol.mars
    await shipCreated(sid2 , pid2, 'sol.mars', WITH_ANSIBLE)

    const { events, stop } = collectEvents(kafka, [ 'events.comms' ])
    await publish(CMD.comms.send.requested, { pid: pid1, to: pid2, body: 'hi from the lane' })

    const sent = await wherePayload(events, EVT.message.sent, { from: pid1, to: pid2 })
    stop()

    assert.equal(sent.payload.deliver, sent.payload.sent, 'the transit lane ends exactly at the recipient')
})

test('the ansible needs a transceiver on both ends', async () => {
    const sid1 = guid(PRFX), pid1 = guid(PRFX)
    const sid2 = guid(PRFX), pid2 = guid(PRFX)
    await shipCreated(sid1, pid1, 'sol.outpost', NO_ANSIBLE)
    await shipCreated(sid2, pid2, 'alpha.exchange', WITH_ANSIBLE)

    const { events, stop } = collectEvents(kafka, [ 'events.comms' ])
    await publish(CMD.comms.send.requested, { pid: pid1, to: pid2, body: 'hi' })

    const rejected = await wherePayload(events, EVT.message.send.rejected, { pid: pid1 })
    stop()

    assert.equal(rejected.payload.reason, 'no ansible fitted')
})

test('a fitted transceiver removed on refit blocks the next message', async () => {
    const sid = guid(PRFX), pid = guid(PRFX)
    const otherSid = guid(PRFX), otherPid = guid(PRFX)
    await shipCreated(sid, pid, 'sol.outpost', WITH_ANSIBLE)
    await shipCreated(otherSid, otherPid, 'alpha.exchange', WITH_ANSIBLE)

    await producer.publishEvent(createEventEnvelope({
        eid              : Crypto.randomUUID(),
        event_type       : EVT.ship.rig.changed,
        aggregate_id     : sid,
        aggregate_type   : 'ship',
        aggregate_version: 2,
        producer         : 'integration-test',
        payload          : {
            pid, sid, slot: 'utility1', fitted: NO_ANSIBLE,
            capacity: 20, velocity: 0.6, acceleration: 0.002, hull: 'starter', rig: 2,
            operation: guid('refit'), outgoing: 'ansible.mk1',
            power: 1, power_pool: 8,
        },
    }))
    await waitFor(async () => (await sql`select has_ansible from ships where sid = ${ sid }`)?.has_ansible === false)

    const { events, stop } = collectEvents(kafka, [ 'events.comms' ])
    await publish(CMD.comms.send.requested, { pid, to: otherPid, body: 'hi' })

    const rejected = await wherePayload(events, EVT.message.send.rejected, { pid })
    stop()

    assert.equal(rejected.payload.reason, 'no ansible fitted')
})
