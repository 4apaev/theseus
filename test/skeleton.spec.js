import assert from 'node:assert/strict'
import test   from 'node:test'

import { service as gatewayServiceName             } from '#apps/gateway/src/main.js'
import { commandTopics, createCommandEnvelope          } from '#packages/contracts/src/index.js'
import { capitalCost, commonFrameYears, shipFrameYears } from '#packages/domain/src/index.js'
import { createTopicRecord, decodeJson                 } from '#packages/kafka/src/index.js'

import '#packages/testing/src/index.js?title=🧪 🚀 SKELETON'

test('repo skeleton exposes service entrypoints', () => {
    assert.equal(gatewayServiceName, 'gateway')
})

test('contracts can create command envelopes', () => {
    const command = createCommandEnvelope({
        cmd         : 'cmd_test',
        command_type: 'ship.travel.requested.v1',
        requested_by: 'player_test',
        payload     : {
            from: 'sol.outpost',
            pid : 'player_test',
            sid : 'ship_test',
            to  : 'alpha.exchange',
        },
    })

    assert.equal(command.cmd, 'cmd_test')
    assert.equal(command.correlation_id, 'cmd_test')
    assert.equal(commandTopics.ship, 'commands.ship')
})

test('trade math uses common-frame time', () => {
    const years = commonFrameYears(4.3, 0.6)
    const subj = shipFrameYears(4.3, 0.6)
    const cost = capitalCost(100, 0.05, years)

    assert.equal(+years.toFixed(3), 7.167)
    assert.equal(+subj.toFixed(3), 5.733)
    assert.equal(+cost.toFixed(2), 141.86)
})

test('kafka record helper round-trips json payloads', () => {
    const record = createTopicRecord({
        key  : 'ship_test',
        topic: commandTopics.ship,
        value: {
            ok: true,
        },
    })
    const decoded = decodeJson(record.messages[ 0 ].value)

    assert.deepEqual(decoded, { ok: true })
})
