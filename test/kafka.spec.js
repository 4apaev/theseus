import assert from 'node:assert/strict'
import test from 'node:test'

import { createFakeKafka } from '#packages/testing/src/index.js?title=🧪 📬 KAFKA'
import {
    Store,
    createConsumer,
    createProducer,
    createEmitter,
    createCommandRecord,
    createTopicRecord,
    decodeTopicMessage,
    decodeJson,
} from '@theseus/kafka'

import {
    createEventEnvelope,
    createCommandEnvelope,
    eventTopics,
    eventTypes,
} from '@theseus/contracts'

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

// ── idempotency store ────────────────────────────────────────────────────────

test('Store marks and remembers ids', () => {
    const store = Store.of()
    assert.ok(store instanceof Store)
    assert.equal(store.mark('e1'), true)
    assert.ok(store.has('e1'))
    assert.ok(!store.has('e2'))
    assert.equal(Object.prototype.toString.call(store), '[object Store]')
})

test('Store.identity extracts eid then cmd', () => {
    assert.equal(Store.identity({ eid: 'e1', cmd: 'c1' }), 'e1')
    assert.equal(Store.identity({ cmd: 'c1' }), 'c1')
    assert.equal(Store.identity({}), undefined)
    assert.equal(Store.identity(null), undefined)
})

// ── records ──────────────────────────────────────────────────────────────────

test('createCommandRecord routes a valid command to its topic', () => {
    const rec = createCommandRecord(createCommandEnvelope({
        cmd         : 'cmd-1',
        command_type: 'ship.travel.requested.v1',
        requested_by: 'spec',
        payload     : { sid: 's1', pid: 'p1', from: 'sol.outpost', to: 'alpha.exchange' },
    }))

    assert.equal(rec.topic, 'commands.ship')
    assert.equal(rec.messages[ 0 ].key, 's1')
    assert.equal(decodeJson(rec.messages[ 0 ].value).cmd, 'cmd-1')
})

test('createEmitter fills eid, producer and version defaults', () => {
    const emit = createEmitter('spec-service')
    const rec  = emit('ship.arrived.v1', {
        aggregate_id  : 's1',
        aggregate_type: 'ship',
        causation_id  : 'cmd-1',
        payload       : { sid: 's1', pid: 'p1', stid: 'sol.outpost', arrived: (new Date).toISOString() },
    })

    assert.equal(rec.topic, 'events.ship')
    assert.equal(rec.messages[ 0 ].key, 's1')

    const e = decodeJson(rec.messages[ 0 ].value)
    assert.ok(e.eid, 'eid generated')
    assert.equal(e.producer, 'spec-service')
    assert.equal(e.aggregate_version, 1)
    assert.equal(e.correlation_id, 'cmd-1', 'correlation falls back to causation')
})

test('decodeTopicMessage decodes the value buffer', () => {
    const rec = createTopicRecord({ topic: 't', key: 'k', value: { x: 1 }})
    const msg = decodeTopicMessage({ ...rec.messages[ 0 ], topic: rec.topic, offset: '0', partition: 0 })
    assert.deepEqual(msg.value, { x: 1 })
    assert.equal(msg.topic, 't')
})

test('memory kafka rejects a record without topic or messages', async () => {
    const kafka = createFakeKafka()
    await assert.rejects(() => kafka.publish({ messages: []}), /topic and messages/)
    await assert.rejects(() => kafka.publish({ topic: 't' }), /topic and messages/)
})
