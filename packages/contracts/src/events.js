import {
    field,
    freeze,
    freezer,
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

export const eventTopics = Object.freeze({
    all   : 'events.all',
    cargo : 'events.cargo',
    market: 'events.market',
    player: 'events.player',
    ship  : 'events.ship',
    wallet: 'events.wallet',
})

export const tree = freezer({
    player: {
        created     : playerCreated.slug,
        registration: { rejected: playerRegistrationRejected.slug },
    },
    wallet: {
        created    : walletCreated.slug,
        debited    : walletDebited.slug,
        credited   : walletCredited.slug,
        transaction: { rejected: walletTransactionRejected.slug },
    },
    ship: {
        created : shipCreated.slug,
        departed: shipDeparted.slug,
        arrived : shipArrived.slug,
        travel  : { rejected: shipTravelRejected.slug },
    },
    cargo: {
        loaded   : cargoLoaded.slug,
        unloaded : cargoUnloaded.slug,
        operation: { rejected: cargoOperationRejected.slug },
    },
    market: {
        price: {
            changed: marketPriceChanged.slug,
        },
    },
    trade: {
        executed: tradeExecuted.slug,
        rejected: tradeRejected.slug,
    },
})

export const [
    eventDefinitions,
    eventTypes,
] = freeze(definitions)

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
