import test   from 'node:test'
import assert from 'node:assert/strict'

import { createMemoryKafka, createProducer } from '@theseus/kafka'
import { commandTree as CMD } from '@theseus/contracts'

import {
    guid,
    waitFor,
    collectEvents,
    createPublisher,
} from '#packages/testing/src/index.js?title=🧪 🧪 TESTING'

// ── guid ─────────────────────────────────────────────────────────────────────

test('guid is util.guid - bare uuid or prefix_uuid', () => {
    assert.match(guid(), /^[0-9a-f-]{36}$/)
    assert.match(guid('itg'), /^itg_[0-9a-f-]{36}$/)
    assert.notEqual(guid(), guid())
})

// ── waitFor ──────────────────────────────────────────────────────────────────

test('waitFor resolves with the first truthy result', async () => {
    let n = 0
    const rs = await waitFor(() => ++n >= 3 && 'done', 1000, 1)
    assert.equal(rs, 'done')
    assert.equal(n, 3)
})

test('waitFor throws on timeout', async () => {
    await assert.rejects(
        () => waitFor(() => false, 30, 5),
        /waitFor timed out/,
    )
})

// ── createPublisher / collectEvents ──────────────────────────────────────────

test('createPublisher wraps payload in a valid command envelope', async () => {
    const kafka   = createMemoryKafka()
    const publish = createPublisher(createProducer({ client: kafka }))

    await publish(CMD.ship.travel.requested, {
        sid : 's1',
        pid : 'p1',
        from: 'sol.outpost',
        to  : 'alpha.exchange',
    })

    const [ msg ] = kafka.messages('commands.ship')
    const cmd     = JSON.parse(msg.value)

    assert.equal(cmd.command_type, CMD.ship.travel.requested)
    assert.equal(cmd.requested_by, 'integration-test')
    assert.equal(cmd.payload.sid, 's1')
    assert.ok(cmd.cmd, 'cmd id set')
})

test('collectEvents decodes messages and stops collecting after stop()', async () => {
    const kafka = createMemoryKafka()
    const { events, stop } = collectEvents(kafka, [ 'events.ship' ])

    await kafka.publish({
        topic   : 'events.ship',
        messages: [{ key: 's1', value: JSON.stringify({ event_type: 'ship.departed.v1' }) }],
    })

    assert.equal(events.length, 1)
    assert.equal(events[ 0 ].event_type, 'ship.departed.v1')

    stop()
    await kafka.publish({
        topic   : 'events.ship',
        messages: [{ key: 's1', value: JSON.stringify({ event_type: 'ship.arrived.v1' }) }],
    })
    assert.equal(events.length, 1, 'no collection after stop')
})
