import assert from 'node:assert/strict'
import test   from 'node:test'

import {
    commandTopic,
    commandTopics,
    commandTypes,
    createCommandEnvelope,
    createEventEnvelope,
    eventTopic,
    eventTopics,
    eventTypes,
} from '#packages/contracts/src/index.js'

test('phase 1 command catalog maps commands to topics', () => {
    assert.equal(
        commandTopic(commandTypes.player_register_requested_v1),
        commandTopics.player,
    )
    assert.equal(
        commandTopic(commandTypes.market_buy_requested_v1),
        commandTopics.market,
    )
})

test('phase 1 event catalog maps events to topics', () => {
    assert.equal(
        eventTopic(eventTypes.ship_departed_v1),
        eventTopics.ship,
    )
    assert.equal(
        eventTopic(eventTypes.trade_executed_v1),
        eventTopics.market,
    )
    assert.equal(eventTopics.all, 'events.all')
})

test('command envelope validates payload fields', () => {
    assert.throws(() => createCommandEnvelope({
        command_id  : 'cmd_bad',
        command_type: commandTypes.market_buy_requested_v1,
        requested_by: 'player_test',
        payload     : {
            good_id       : 'water',
            max_unit_price: 10,
            player_id     : 'player_test',
            quantity      : 0,
            ship_id       : 'ship_test',
            station_id    : 'sol.outpost',
        },
    }), /quantity/)
})

test('event envelope validates event-specific payloads', () => {
    const event = createEventEnvelope({
        aggregate_id     : 'ship_test',
        aggregate_type   : 'ship',
        aggregate_version: 1,
        event_id         : 'evt_ship_created',
        event_type       : eventTypes.ship_created_v1,
        producer         : 'ship-service',
        payload          : {
            cargo_capacity: 20,
            name          : 'courier',
            player_id     : 'player_test',
            ship_id       : 'ship_test',
            station_id    : 'sol.outpost',
            velocity_c    : 0.6,
        },
    })

    assert.equal(event.event_type, eventTypes.ship_created_v1)
    assert.equal(event.correlation_id, 'evt_ship_created')
})
