import { O } from 'garage/util'
import {
    field,
    freeze,
    requireField,
    validatePayload,
    validateEnvelope,
    assertKnownDefinition,
} from './field.js'

import {
    playerCreated,
    playerRegistrationRejected,
    walletCreated,
    walletDebited,
    walletCredited,
    walletTransactionRejected,
    shipCreated,
    shipDeparted,
    shipArrived,
    shipTravelRejected,
    cargoLoaded,
    cargoUnloaded,
    cargoOperationRejected,
    tradeExecuted,
    tradeRejected,
    marketPriceChanged,
} from './schemas.js'

const definitions = [
    playerCreated,
    playerRegistrationRejected,
    walletCreated,
    walletDebited,
    walletCredited,
    walletTransactionRejected,
    shipCreated,
    shipDeparted,
    shipArrived,
    shipTravelRejected,
    cargoLoaded,
    cargoUnloaded,
    cargoOperationRejected,
    tradeExecuted,
    tradeRejected,
    marketPriceChanged,
]

export const eventTopics = O.freeze({
    all   : 'events.all',
    cargo : 'events.cargo',
    market: 'events.market',
    player: 'events.player',
    ship  : 'events.ship',
    wallet: 'events.wallet',
})

export const [
    eventDefinitions,
    eventTypes,
] = freeze(definitions, 'slug')

export function eventDefinition(etype) {
    return assertKnownDefinition(eventDefinitions, etype, 'event')
}

export function eventKey(e) {
    const def = eventDefinition(e.event_type)
    return def.key(e.payload)
}

export function eventTopic(etype) {
    return `events.${ eventDefinition(etype).topic }`
}

export function validateEvent(e) {
    validateEnvelope(e, {
        id      : 'eid',
        kind    : 'event_type',
        time    : 'occurred',
        required: [
            'aggregate_type',
            'aggregate_id',
            'correlation_id',
            'producer',
        ],
    })
    requireField(e, 'aggregate_version', field.positiveInteger)
    validatePayload(eventDefinition(e.event_type), e.payload)
    return e
}
