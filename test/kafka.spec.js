import assert from 'node:assert/strict'
import test from 'node:test'

import { createFakeKafka } from '#packages/testing/src/index.js'
import { createConsumer, createProducer } from '#packages/kafka/src/index.js'
import { createEventEnvelope, eventTopics, eventTypes } from '#packages/contracts/src/index.js'

console.log('\n── PKG/KAFKA %s\n', '─'.repeat(64))

// ── basic publish / consume ─────────────────────────────────────────────────

test('fake kafka publishes and consumes typed events', async () => {
    const seen = []
    const kafka = createFakeKafka()
    const consumer = createConsumer({
        client : kafka,
        topics : [ eventTopics.ship ],
        groupId: 'test-projection',
        handler(msg) { seen.push(msg.value) },
    })
    const producer = createProducer({ client: kafka })

    await producer.publishEvent(shipCreatedEvent('evt_once'))

    assert.equal(seen.length, 1)
    assert.equal(seen[ 0 ].event_type, eventTypes.ship_created_v1)
    assert.deepEqual(consumer.stats(), { duplicates: 0, handled: 1 })
})

test('two consumer groups both receive the same event', async () => {
    const g1 = []
    const g2 = []
    const kafka = createFakeKafka()
    createConsumer({ client: kafka, topics: [ eventTopics.ship ], groupId: 'g1', handler: m => g1.push(m) })
    createConsumer({ client: kafka, topics: [ eventTopics.ship ], groupId: 'g2', handler: m => g2.push(m) })
    const producer = createProducer({ client: kafka })

    await producer.publishEvent(shipCreatedEvent('evt_broadcast'))

    assert.equal(g1.length, 1)
    assert.equal(g2.length, 1)
})

test('stopped consumer no longer receives messages', async () => {
    const seen = []
    const kafka = createFakeKafka()
    const consumer = createConsumer({
        client : kafka,
        topics : [ eventTopics.ship ],
        groupId: 'g1',
        handler: m => seen.push(m),
    })
    const producer = createProducer({ client: kafka })

    await producer.publishEvent(shipCreatedEvent('evt_1'))
    consumer.stop()
    await producer.publishEvent(shipCreatedEvent('evt_2'))

    assert.equal(seen.length, 1)
})

// ── publishAllEvents ────────────────────────────────────────────────────────

test('publishAllEvents sends to domain topic and events.all', async () => {
    const domain = []
    const all = []
    const kafka = createFakeKafka()
    createConsumer({ client: kafka, topics: [ eventTopics.ship ], groupId: 'g1', handler: m => domain.push(m) })
    createConsumer({ client: kafka, topics: [ eventTopics.all  ], groupId: 'g2', handler: m => all.push(m) })
    const producer = createProducer({ client: kafka, publishAllEvents: true })

    await producer.publishEvent(shipCreatedEvent('evt_fan'))

    assert.equal(domain.length, 1)
    assert.equal(all.length, 1)
    assert.equal(all[ 0 ].value.eid, 'evt_fan')
})

test('default producer does not publish to events.all', async () => {
    const all = []
    const kafka = createFakeKafka()
    createConsumer({ client: kafka, topics: [ eventTopics.all ], groupId: 'g1', handler: m => all.push(m) })
    const producer = createProducer({ client: kafka })

    await producer.publishEvent(shipCreatedEvent('evt_no_fan'))

    assert.equal(all.length, 0)
})

// ── idempotency ─────────────────────────────────────────────────────────────

test('consumer detects duplicate event ids', async () => {
    const seen = []
    const kafka = createFakeKafka()
    const consumer = createConsumer({
        client : kafka,
        topics : [ eventTopics.ship ],
        groupId: 'test-projection',
        handler: msg => seen.push(msg.value.eid),
    })
    const producer = createProducer({ client: kafka })
    const event = shipCreatedEvent('evt_duplicate')

    await producer.publishEvent(event)
    await producer.publishEvent(event)

    assert.deepEqual(seen, [ 'evt_duplicate' ])
    assert.deepEqual(consumer.stats(), { duplicates: 1, handled: 1 })
})

test('tombstone message does not crash consumer', async () => {
    const seen = []
    const kafka = createFakeKafka()
    createConsumer({
        client : kafka,
        topics : [ eventTopics.ship ],
        groupId: 'g1',
        handler: m => seen.push(m.value),
    })

    await kafka.publish({
        topic   : eventTopics.ship,
        messages: [{ key: 'ship_1', value: null }],
    })

    assert.equal(seen.length, 1)
    assert.equal(seen[ 0 ], null)
})

// ── helpers ─────────────────────────────────────────────────────────────────

function shipCreatedEvent(eid) {
    return createEventEnvelope({
        aggregate_id     : 'ship_test',
        aggregate_type   : 'ship',
        aggregate_version: 1,
        eid,
        event_type       : eventTypes.ship_created_v1,
        producer         : 'ship-service',
        payload          : {
            capacity: 20,
            name    : 'courier',
            pid     : 'player_test',
            sid     : 'ship_test',
            stid    : 'sol.outpost',
            velocity: 0.6,
        },
    })
}
