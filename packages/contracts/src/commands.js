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
        key    : keyBy('player_id'),
        payload: {
            amount      : field.positiveNumber,
            player_id   : field.nonEmptyString,
            reason      : field.nonEmptyString,
            reference_id: field.nonEmptyString,
        },
    },
    {
        type   : 'wallet.credit.requested.v1',
        topic  : commandTopics.wallet,
        key    : keyBy('player_id'),
        payload: {
            amount      : field.positiveNumber,
            player_id   : field.nonEmptyString,
            reason      : field.nonEmptyString,
            reference_id: field.nonEmptyString,
        },
    },
    {
        type   : 'ship.travel.requested.v1',
        topic  : commandTopics.ship,
        key    : keyBy('ship_id'),
        payload: {
            from_station_id: field.nonEmptyString,
            player_id      : field.nonEmptyString,
            ship_id        : field.nonEmptyString,
            to_station_id  : field.nonEmptyString,
        },
    },
    {
        type   : 'cargo.load.requested.v1',
        topic  : commandTopics.cargo,
        key    : keyBy('ship_id'),
        payload: cargoCommandPayload(),
    },
    {
        type   : 'cargo.unload.requested.v1',
        topic  : commandTopics.cargo,
        key    : keyBy('ship_id'),
        payload: cargoCommandPayload(),
    },
    {
        type   : 'market.buy.requested.v1',
        topic  : commandTopics.market,
        key    : keyBy('station_id'),
        payload: {
            good_id       : field.nonEmptyString,
            max_unit_price: field.positiveNumber,
            player_id     : field.nonEmptyString,
            quantity      : field.positiveInteger,
            ship_id       : field.nonEmptyString,
            station_id    : field.nonEmptyString,
        },
    },
    {
        type   : 'market.sell.requested.v1',
        topic  : commandTopics.market,
        key    : keyBy('station_id'),
        payload: {
            good_id       : field.nonEmptyString,
            min_unit_price: field.positiveNumber,
            player_id     : field.nonEmptyString,
            quantity      : field.positiveInteger,
            ship_id       : field.nonEmptyString,
            station_id    : field.nonEmptyString,
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
        id      : 'command_id',
        kind    : 'command_type',
        time    : 'requested_at',
        required: [ 'requested_by', 'correlation_id' ],
    })

    validatePayload(commandDefinition(cmd.command_type), cmd.payload)
    return cmd
}

function cargoCommandPayload() {
    return {
        good_id     : field.nonEmptyString,
        player_id   : field.nonEmptyString,
        quantity    : field.positiveInteger,
        reference_id: field.nonEmptyString,
        ship_id     : field.nonEmptyString,
        station_id  : field.nonEmptyString,
    }
}
