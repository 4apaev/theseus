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
import { field } from '#packages/contracts/src/field.js'
import '#packages/testing/src/index.js'

// ── catalog ────────────────────────────────────────────────────────────────

test('command catalog maps commands to topics', () => {
    assert.equal(commandTopic(commandTypes.player_register_requested_v1), commandTopics.player)
    assert.equal(commandTopic(commandTypes.player_login_requested_v1)   , commandTopics.player)
    assert.equal(commandTopic(commandTypes.market_buy_requested_v1)     , commandTopics.market)
    assert.equal(commandTopic(commandTypes.ship_travel_requested_v1)    , commandTopics.ship)
    assert.equal(commandTopic(commandTypes.cargo_load_requested_v1)     , commandTopics.cargo)
    assert.equal(commandTopic(commandTypes.wallet_debit_requested_v1)   , commandTopics.wallet)
    assert.equal(commandTopic(commandTypes.ship_module_install_requested_v1)  , commandTopics.ship)
    assert.equal(commandTopic(commandTypes.ship_module_remove_requested_v1)   , commandTopics.ship)
    assert.equal(commandTopic(commandTypes.cargo_module_exchange_requested_v1), commandTopics.cargo)
})

test('event catalog maps events to topics', () => {
    assert.equal(eventTopic(eventTypes.ship_departed_v1) , eventTopics.ship)
    assert.equal(eventTopic(eventTypes.player_login_succeeded_v1), eventTopics.player)
    assert.equal(eventTopic(eventTypes.player_login_rejected_v1) , eventTopics.player)
    assert.equal(eventTopic(eventTypes.market_trade_executed_v1), eventTopics.market)
    assert.equal(eventTopic(eventTypes.player_created_v1), eventTopics.player)
    assert.equal(eventTopic(eventTypes.cargo_loaded_v1)  , eventTopics.cargo)
    assert.equal(eventTopics.all, 'events.all')
    assert.equal(eventTopic(eventTypes.ship_rig_changed_v1)                , eventTopics.ship)
    assert.equal(eventTopic(eventTypes.ship_module_operation_rejected_v1)  , eventTopics.ship)
    assert.equal(eventTopic(eventTypes.cargo_module_exchanged_v1)          , eventTopics.cargo)
    assert.equal(eventTopic(eventTypes.cargo_module_exchange_rejected_v1)  , eventTopics.cargo)
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
            price_unit_max: 10,
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
            pid       : 'player_test',
            sid       : 'ship_test',
            stid      : 'sol.outpost',
            name      : 'courier',
            hull      : 'starter',
            rig       : 1,
            velocity  : 0.6,
            capacity  : 20,
            power     : 1,
            power_pool: 8,
            fitted    : [{ slot: 'power1', gid: 'reactor.mk1' }],
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

test('shipName accepts a sane name and rejects the rest', () => {
    const ok = [ 'Argo', 'far treasure', 'O\'Brien-7', 'Unicorn 3.0', 'a' ]
    const no = [ '', '   ', ' pad', 'pad ', 'a'.repeat(25), '<script>', 'rocket \u{1F680}', '\u0007bell', null, 7 ]

    for (const n of ok) assert.ok(field.shipName(n), `accepts ${ JSON.stringify(n) }`)
    for (const n of no) assert.ok(!field.shipName(n), `rejects ${ JSON.stringify(n) }`)
})

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

// ── ship modules ─────────────────────────────────────────────────────────────

test('fittedSlots accepts a well-shaped array, rejects a malformed entry', () => {
    assert.ok(field.fittedSlots([]))
    assert.ok(field.fittedSlots([{ slot: 'power1', gid: 'reactor.mk1' }]))
    assert.ok(!field.fittedSlots([{ slot: 'power1' }]), 'missing gid')
    assert.ok(!field.fittedSlots('nope'), 'not an array at all')
})

test('reasons requires at least one non-empty reason', () => {
    assert.ok(field.reasons([ 'ship unknown' ]))
    assert.ok(!field.reasons([]), 'empty array is not a reason to reject anything')
    assert.ok(!field.reasons([ '' ]), 'a blank reason is not a reason')
})

test('ship.module.install.requested is a valid command envelope', () => {
    const cmd = createCommandEnvelope({
        cmd         : 'cmd_1',
        command_type: commandTypes.ship_module_install_requested_v1,
        requested_by: 'player_1',
        payload     : { pid: 'player_1', sid: 'ship_1', slot: 'power1', gid: 'reactor.mk2' },
    })
    assert.equal(cmd.command_type, commandTypes.ship_module_install_requested_v1)
})

test('ship.module.remove.requested is a valid command envelope', () => {
    const cmd = createCommandEnvelope({
        cmd         : 'cmd_1',
        command_type: commandTypes.ship_module_remove_requested_v1,
        requested_by: 'player_1',
        payload     : { pid: 'player_1', sid: 'ship_1', slot: 'power1' },
    })
    assert.equal(cmd.command_type, commandTypes.ship_module_remove_requested_v1)
})

test('cargo.module.exchange.requested allows either package gid alone, or both', () => {
    const install = { operation: 'op_1', pid: 'player_1', sid: 'ship_1', incoming: 'reactor.mk2', capacity_next: 20 }
    const remove   = { operation: 'op_2', pid: 'player_1', sid: 'ship_1', outgoing: 'reactor.mk1', capacity_next: 20 }
    const replace  = { ...install, outgoing: 'reactor.mk1' }

    for (const payload of [ install, remove, replace ]) {
        assert.equal(createCommandEnvelope({
            cmd         : 'cmd_1',
            command_type: commandTypes.cargo_module_exchange_requested_v1,
            requested_by: 'ship-service',
            payload,
        }).command_type, commandTypes.cargo_module_exchange_requested_v1)
    }
})

test('ship.rig.changed is a valid event, full snapshot included', () => {
    const evt = createEventEnvelope({
        aggregate_id     : 'ship_1',
        aggregate_type   : 'ship',
        aggregate_version: 2,
        eid              : 'eid_1',
        event_type       : eventTypes.ship_rig_changed_v1,
        producer         : 'ship-service',
        payload          : {
            operation: 'op_1', pid: 'player_1', sid: 'ship_1',
            hull: 'starter', rig: 2, slot: 'cruise1',
            incoming: 'cruise.mk2', outgoing: 'cruise.mk1',
            fitted: [
                { slot: 'power1', gid: 'reactor.mk2' },
                { slot: 'cruise1', gid: 'cruise.mk2' },
                { slot: 'cargo1', gid: 'cargo.mk1' },
            ],
            capacity: 20, velocity: 0.648, power: 4, power_pool: 12,
        },
    })
    assert.equal(evt.event_type, eventTypes.ship_rig_changed_v1)
})

test('ship.rig.changed rejects a malformed fitted slot', () => {
    assert.throws(() => createEventEnvelope({
        aggregate_id     : 'ship_1',
        aggregate_type   : 'ship',
        aggregate_version: 2,
        eid              : 'eid_1',
        event_type       : eventTypes.ship_rig_changed_v1,
        producer         : 'ship-service',
        payload          : {
            operation: 'op_1', pid: 'player_1', sid: 'ship_1',
            hull: 'starter', rig: 2, slot: 'cruise1',
            fitted: [{ slot: 'cruise1' }], // no gid
            capacity: 20, velocity: 0.6, power: 2, power_pool: 8,
        },
    }), /fitted/)
})

test('ship.module.operation.rejected requires at least one reason', () => {
    const evt = createEventEnvelope({
        aggregate_id     : 'ship_1',
        aggregate_type   : 'ship',
        aggregate_version: 1,
        eid              : 'eid_1',
        event_type       : eventTypes.ship_module_operation_rejected_v1,
        producer         : 'ship-service',
        payload          : { operation: 'op_1', pid: 'player_1', sid: 'ship_1', reasons: [ 'power draw 5 exceeds 4 available' ]},
    })
    assert.equal(evt.event_type, eventTypes.ship_module_operation_rejected_v1)

    assert.throws(() => createEventEnvelope({
        aggregate_id     : 'ship_1',
        aggregate_type   : 'ship',
        aggregate_version: 1,
        eid              : 'eid_2',
        event_type       : eventTypes.ship_module_operation_rejected_v1,
        producer         : 'ship-service',
        payload          : { operation: 'op_1', pid: 'player_1', sid: 'ship_1', reasons: []},
    }), /reasons/)
})

test('cargo.module.exchanged and cargo.module.exchange.rejected are valid events', () => {
    const exchanged = createEventEnvelope({
        aggregate_id     : 'ship_1',
        aggregate_type   : 'cargo',
        aggregate_version: 1,
        eid              : 'eid_1',
        event_type       : eventTypes.cargo_module_exchanged_v1,
        producer         : 'market-service',
        payload          : { operation: 'op_1', pid: 'player_1', sid: 'ship_1', incoming: 'reactor.mk2', outgoing: 'reactor.mk1', load: 5, capacity_next: 20 },
    })
    assert.equal(exchanged.event_type, eventTypes.cargo_module_exchanged_v1)

    const rejected = createEventEnvelope({
        aggregate_id     : 'ship_1',
        aggregate_type   : 'cargo',
        aggregate_version: 1,
        eid              : 'eid_2',
        event_type       : eventTypes.cargo_module_exchange_rejected_v1,
        producer         : 'market-service',
        payload          : { operation: 'op_1', pid: 'player_1', sid: 'ship_1', reasons: [ 'over capacity' ]},
    })
    assert.equal(rejected.event_type, eventTypes.cargo_module_exchange_rejected_v1)
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
