import assert from 'node:assert/strict'
import test   from 'node:test'

import {
    commandTopic,
    commandTopics,
    commandTypes,
    commandDefinition,
    createCommandEnvelope,
    createEventEnvelope,
    eventDefinition,
    eventTopic,
    eventTopics,
    eventTypes,
} from '#packages/contracts/src/index.js'

// ── catalog ────────────────────────────────────────────────────────────────

test('command catalog maps commands to topics', () => {
    assert.equal(commandTopic(commandTypes.player_register_requested_v1), commandTopics.player)
    assert.equal(commandTopic(commandTypes.market_buy_requested_v1)     , commandTopics.market)
    assert.equal(commandTopic(commandTypes.ship_travel_requested_v1)    , commandTopics.ship)
    assert.equal(commandTopic(commandTypes.cargo_load_requested_v1)     , commandTopics.cargo)
    assert.equal(commandTopic(commandTypes.wallet_debit_requested_v1)   , commandTopics.wallet)
})

test('event catalog maps events to topics', () => {
    assert.equal(eventTopic(eventTypes.ship_departed_v1) , eventTopics.ship)
    assert.equal(eventTopic(eventTypes.trade_executed_v1), eventTopics.market)
    assert.equal(eventTopic(eventTypes.player_created_v1), eventTopics.player)
    assert.equal(eventTopic(eventTypes.cargo_loaded_v1)  , eventTopics.cargo)
    assert.equal(eventTopics.all, 'events.all')
})

test('unknown command type throws', () => {
    assert.throws(() => commandDefinition('nope.v1'), /unknown command type/)
})

test('unknown event type throws', () => {
    assert.throws(() => eventDefinition('nope.v1'), /unknown event type/)
})

// ── command envelope ────────────────────────────────────────────────────────

test('command envelope auto-fills requested timestamp and correlation_id', () => {
    const before = Date.now()
    const cmd = createCommandEnvelope({
        cmd         : 'cmd_1',
        command_type: commandTypes.player_register_requested_v1,
        requested_by: 'anon',
        payload     : { handle: 'alice', password: 'secret' },
    })

    assert.ok(!isNaN(Date.parse(cmd.requested)))
    assert.ok(Date.parse(cmd.requested) >= before)
    assert.equal(cmd.correlation_id, 'cmd_1')
})

test('command envelope respects provided correlation_id', () => {
    const cmd = createCommandEnvelope({
        cmd           : 'cmd_1',
        command_type  : commandTypes.player_register_requested_v1,
        requested_by  : 'anon',
        correlation_id: 'saga_99',
        payload       : { handle: 'alice', password: 'secret' },
    })

    assert.equal(cmd.correlation_id, 'saga_99')
})

test('command envelope rejects invalid payload field', () => {
    assert.throws(() => createCommandEnvelope({
        cmd         : 'cmd_bad',
        command_type: commandTypes.market_buy_requested_v1,
        requested_by: 'player_test',
        payload     : {
            gid           : 'water',
            max_unit_price: 10,
            pid           : 'player_test',
            quantity      : 0,
            sid           : 'ship_test',
            stid          : 'sol.outpost',
        },
    }), /quantity/)
})

test('command envelope rejects missing cmd', () => {
    assert.throws(() => createCommandEnvelope({
        command_type: commandTypes.player_register_requested_v1,
        requested_by: 'anon',
        payload     : { handle: 'alice', password: 'secret' },
    }), /envelope\.cmd/)
})

// ── event envelope ──────────────────────────────────────────────────────────

test('event envelope auto-fills occurred and correlation_id from eid', () => {
    const before = Date.now()
    const evt = createEventEnvelope(playerCreatedInput('eid_1'))

    assert.ok(!isNaN(Date.parse(evt.occurred)))
    assert.ok(Date.parse(evt.occurred) >= before)
    assert.equal(evt.correlation_id, 'eid_1')
})

test('event envelope inherits correlation_id from causation_id', () => {
    const evt = createEventEnvelope({
        ...playerCreatedInput('eid_1'),
        causation_id: 'cause_99',
    })

    assert.equal(evt.correlation_id, 'cause_99')
})

test('event envelope respects provided correlation_id over causation_id', () => {
    const evt = createEventEnvelope({
        ...playerCreatedInput('eid_1'),
        causation_id  : 'cause_99',
        correlation_id: 'corr_77',
    })

    assert.equal(evt.correlation_id, 'corr_77')
})

test('event envelope validates event-specific payloads', () => {
    const event = createEventEnvelope({
        aggregate_id     : 'ship_test',
        aggregate_type   : 'ship',
        aggregate_version: 1,
        eid              : 'eid_ship',
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

    assert.equal(event.event_type, eventTypes.ship_created_v1)
    assert.equal(event.correlation_id, 'eid_ship')
})

test('event envelope rejects aggregate_version 0', () => {
    assert.throws(() => createEventEnvelope({
        ...playerCreatedInput('eid_1'),
        aggregate_version: 0,
    }), /aggregate_version/)
})

test('event envelope rejects missing aggregate_version', () => {
    assert.throws(() => createEventEnvelope({
        ...playerCreatedInput('eid_1'),
        aggregate_version: undefined,
    }), /aggregate_version/)
})

test('event envelope rejects missing eid', () => {
    assert.throws(() => createEventEnvelope({
        ...playerCreatedInput(undefined),
    }), /envelope\.eid/)
})

// ── optional payload fields ─────────────────────────────────────────────────

test('cargo.operation.rejected accepts missing optional fields', () => {
    const evt = createEventEnvelope({
        aggregate_id     : 'ship_1',
        aggregate_type   : 'cargo',
        aggregate_version: 1,
        eid              : 'eid_rej',
        event_type       : eventTypes.cargo_operation_rejected_v1,
        producer         : 'cargo-service',
        payload          : { pid: 'player_1', reason: 'no space', sid: 'ship_1' },
    })

    assert.equal(evt.event_type, eventTypes.cargo_operation_rejected_v1)
})

test('cargo.operation.rejected rejects empty string for optional gid', () => {
    assert.throws(() => createEventEnvelope({
        aggregate_id     : 'ship_1',
        aggregate_type   : 'cargo',
        aggregate_version: 1,
        eid              : 'eid_rej',
        event_type       : eventTypes.cargo_operation_rejected_v1,
        producer         : 'cargo-service',
        payload          : { pid: 'player_1', reason: 'no space', sid: 'ship_1', gid: '' },
    }), /gid/)
})

// ── helpers ─────────────────────────────────────────────────────────────────

function playerCreatedInput(eid) {
    return {
        aggregate_id     : 'player_1',
        aggregate_type   : 'player',
        aggregate_version: 1,
        eid,
        event_type       : eventTypes.player_created_v1,
        producer         : 'player-service',
        payload          : { handle: 'alice', pid: 'player_1' },
    }
}
