import assert from 'node:assert/strict'
import test from 'node:test'

import { createFakeKafka } from '#packages/testing/src/index.js'
import { createConsumer, createProducer } from '#packages/kafka/src/index.js'
import { createEventEnvelope, eventTopics, eventTypes } from '#packages/contracts/src/index.js'

test('fake kafka publishes and consumes typed events', async () => {
    const seen = []
    const kafka = createFakeKafka()
    const consumer = createConsumer({
        client : kafka,
        topics : [ eventTopics.ship ],
        groupId: 'test-projection',
        handler(msg) {
            seen.push(msg.value)
        },
    })
    const producer = createProducer({ client: kafka })
    const event = shipCreatedEvent('evt_once')

    await producer.publishEvent(event)

    assert.equal(seen.length, 1)
    assert.equal(seen[ 0 ].event_type, eventTypes.ship_created_v1)
    assert.deepEqual(consumer.stats(), {
        duplicates: 0,
        handled   : 1,
    })
})

test('consumer detects duplicate event ids', async () => {
    const seen = []
    const kafka = createFakeKafka()
    const consumer = createConsumer({
        client : kafka,
        topics : [ eventTopics.ship ],
        groupId: 'test-projection',
        handler(msg) {
            seen.push(msg.value.event_id)
        },
    })
    const producer = createProducer({ client: kafka })
    const event = shipCreatedEvent('evt_duplicate')

    await producer.publishEvent(event)
    await producer.publishEvent(event)

    assert.deepEqual(seen, [ 'evt_duplicate' ])
    assert.deepEqual(consumer.stats(), {
        duplicates: 1,
        handled   : 1,
    })
})

function shipCreatedEvent(eid) {
    return createEventEnvelope({
        aggregate_id     : 'ship_test',
        aggregate_type   : 'ship',
        aggregate_version: 1,
        event_id         : eid,
        event_type       : eventTypes.ship_created_v1,
        producer         : 'ship-service',
        payload          : {
            name          : 'courier',
            ship_id       : 'ship_test',
            player_id     : 'player_test',
            station_id    : 'sol.outpost',
            cargo_capacity: 20,
            velocity_c    : 0.6,
        },
    })
}
