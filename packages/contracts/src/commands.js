import { O } from 'garage/util'
import {
    freeze,
    validatePayload,
    validateEnvelope,
    assertKnownDefinition,
} from './field.js'

import {
    playerRegisterRequested,
    walletDebitRequested,
    walletCreditRequested,
    shipTravelRequested,
    cargoLoadRequested,
    cargoUnloadRequested,
    marketBuyRequested,
    marketSellRequested,
} from './schemas.js'

const definitions = [
    playerRegisterRequested,
    walletDebitRequested,
    walletCreditRequested,
    shipTravelRequested,
    cargoLoadRequested,
    cargoUnloadRequested,
    marketBuyRequested,
    marketSellRequested,
]

export const commandTopics = O.freeze({
    cargo : 'commands.cargo',
    market: 'commands.market',
    player: 'commands.player',
    ship  : 'commands.ship',
    wallet: 'commands.wallet',
})

export const [
    commandDefinitions,
    commandTypes,
] = freeze(definitions, 'slug')

export function commandDefinition(cmdType) {
    return assertKnownDefinition(commandDefinitions, cmdType, 'command')
}

export function commandKey(cmd) {
    const def = commandDefinition(cmd.command_type)
    return def.key(cmd.payload)
}

export function commandTopic(cmdType) {
    return `commands.${ commandDefinition(cmdType).topic }`
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
