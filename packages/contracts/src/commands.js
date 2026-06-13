import {
    keyBy,
    field,
    freezeMap,
    validatePayload,
    validateEnvelope,
    assertKnownDefinition,
    freezeDefinitions,
} from './schema.js'

import { commandTopics } from './topics.js'

const definitions = [
    {
        type   : 'player.register.requested.v1',
        topic  : commandTopics.player,
        key    : keyBy('handle'),
        payload: {
            handle  : field.nonEmptyString,
            password: field.nonEmptyString,
        },
    },
    {
        type   : 'wallet.debit.requested.v1',
        topic  : commandTopics.wallet,
        key    : keyBy('pid'),
        payload: {
            amount      : field.positiveNumber,
            pid         : field.nonEmptyString,
            reason      : field.nonEmptyString,
            reference_id: field.nonEmptyString,
        },
    },
    {
        type   : 'wallet.credit.requested.v1',
        topic  : commandTopics.wallet,
        key    : keyBy('pid'),
        payload: {
            amount      : field.positiveNumber,
            pid         : field.nonEmptyString,
            reason      : field.nonEmptyString,
            reference_id: field.nonEmptyString,
        },
    },
    {
        type   : 'ship.travel.requested.v1',
        topic  : commandTopics.ship,
        key    : keyBy('sid'),
        payload: {
            from_station: field.nonEmptyString,
            pid         : field.nonEmptyString,
            sid         : field.nonEmptyString,
            to_station  : field.nonEmptyString,
        },
    },
    {
        type   : 'cargo.load.requested.v1',
        topic  : commandTopics.cargo,
        key    : keyBy('sid'),
        payload: cargoCommandPayload(),
    },
    {
        type   : 'cargo.unload.requested.v1',
        topic  : commandTopics.cargo,
        key    : keyBy('sid'),
        payload: cargoCommandPayload(),
    },
    {
        type   : 'market.buy.requested.v1',
        topic  : commandTopics.market,
        key    : keyBy('stid'),
        payload: {
            gid           : field.nonEmptyString,
            max_unit_price: field.positiveNumber,
            pid           : field.nonEmptyString,
            quantity      : field.positiveInteger,
            sid           : field.nonEmptyString,
            stid          : field.nonEmptyString,
        },
    },
    {
        type   : 'market.sell.requested.v1',
        topic  : commandTopics.market,
        key    : keyBy('stid'),
        payload: {
            gid           : field.nonEmptyString,
            min_unit_price: field.positiveNumber,
            pid           : field.nonEmptyString,
            quantity      : field.positiveInteger,
            sid           : field.nonEmptyString,
            stid          : field.nonEmptyString,
        },
    },
]

export const commandDefinitions = freezeDefinitions(definitions)
export const commandTypes = freezeMap(
    definitions.map(def => [
        def.type.replaceAll('.', '_'),
        def.type,
    ]),
)

export function commandDefinition(cmdType) {
    return assertKnownDefinition(commandDefinitions, cmdType, 'command')
}

export function commandKey(cmd) {
    const def = commandDefinition(cmd.command_type)
    return def.key(cmd.payload)
}

export function commandTopic(cmdType) {
    return commandDefinition(cmdType).topic
}

export function validateCommand(cmd) {
    validateEnvelope(cmd, {
        id      : 'cmd',
        kind    : 'command_type',
        time    : 'requested',
        required: [ 'requested_by', 'correlation_id' ],
    })

    validatePayload(commandDefinition(cmd.command_type), cmd.payload)
    return cmd
}

function cargoCommandPayload() {
    return {
        gid         : field.nonEmptyString,
        pid         : field.nonEmptyString,
        quantity    : field.positiveInteger,
        reference_id: field.nonEmptyString,
        sid         : field.nonEmptyString,
        stid        : field.nonEmptyString,
    }
}
