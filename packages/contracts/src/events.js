import {
    keyBy,
    field,
    freezeMap,
    requireField,
    validatePayload,
    validateEnvelope,
    assertKnownDefinition,
    freezeDefinitions,
} from './schema.js'

import { eventTopics } from './topics.js'

const side = field.oneOf([ 'buy', 'sell' ])

const definitions = [
    {
        type   : 'player.created.v1',
        topic  : eventTopics.player,
        key    : keyBy('player_id'),
        payload: {
            handle   : field.nonEmptyString,
            player_id: field.nonEmptyString,
        },
    },
    {
        type   : 'player.registration.rejected.v1',
        topic  : eventTopics.player,
        key    : keyBy('handle'),
        payload: {
            handle: field.nonEmptyString,
            reason: field.nonEmptyString,
        },
    },
    {
        type   : 'wallet.created.v1',
        topic  : eventTopics.wallet,
        key    : keyBy('player_id'),
        payload: {
            balance  : field.nonNegativeNumber,
            player_id: field.nonEmptyString,
        },
    },
    {
        type   : 'wallet.debited.v1',
        topic  : eventTopics.wallet,
        key    : keyBy('player_id'),
        payload: walletTransactionPayload(),
    },
    {
        type   : 'wallet.credited.v1',
        topic  : eventTopics.wallet,
        key    : keyBy('player_id'),
        payload: walletTransactionPayload(),
    },
    {
        type   : 'wallet.transaction.rejected.v1',
        topic  : eventTopics.wallet,
        key    : keyBy('player_id'),
        payload: {
            amount      : field.positiveNumber,
            player_id   : field.nonEmptyString,
            reason      : field.nonEmptyString,
            reference_id: field.nonEmptyString,
        },
    },
    {
        type   : 'ship.created.v1',
        topic  : eventTopics.ship,
        key    : keyBy('ship_id'),
        payload: {
            cargo_capacity: field.positiveInteger,
            name          : field.nonEmptyString,
            player_id     : field.nonEmptyString,
            ship_id       : field.nonEmptyString,
            station_id    : field.nonEmptyString,
            velocity_c    : field.velocity,
        },
    },
    {
        type   : 'ship.departed.v1',
        topic  : eventTopics.ship,
        key    : keyBy('ship_id'),
        payload: {
            arrives_at        : field.isoTime,
            common_frame_years: field.positiveNumber,
            departed_at       : field.isoTime,
            from_station_id   : field.nonEmptyString,
            player_id         : field.nonEmptyString,
            ship_frame_years  : field.positiveNumber,
            ship_id           : field.nonEmptyString,
            to_station_id     : field.nonEmptyString,
        },
    },
    {
        type   : 'ship.arrived.v1',
        topic  : eventTopics.ship,
        key    : keyBy('ship_id'),
        payload: {
            arrived_at: field.isoTime,
            player_id : field.nonEmptyString,
            ship_id   : field.nonEmptyString,
            station_id: field.nonEmptyString,
        },
    },
    {
        type   : 'ship.travel.rejected.v1',
        topic  : eventTopics.ship,
        key    : keyBy('ship_id'),
        payload: {
            player_id: field.nonEmptyString,
            reason   : field.nonEmptyString,
            ship_id  : field.nonEmptyString,
        },
    },
    {
        type   : 'cargo.loaded.v1',
        topic  : eventTopics.cargo,
        key    : keyBy('ship_id'),
        payload: cargoPayload(),
    },
    {
        type   : 'cargo.unloaded.v1',
        topic  : eventTopics.cargo,
        key    : keyBy('ship_id'),
        payload: cargoPayload(),
    },
    {
        type   : 'cargo.operation.rejected.v1',
        topic  : eventTopics.cargo,
        key    : keyBy('ship_id'),
        payload: {
            good_id  : field.optionalNonEmptyString,
            player_id: field.nonEmptyString,
            quantity : field.optionalPositiveInteger,
            reason   : field.nonEmptyString,
            ship_id  : field.nonEmptyString,
        },
    },
    {
        type   : 'trade.executed.v1',
        topic  : eventTopics.market,
        key    : keyBy('station_id'),
        payload: {
            good_id    : field.nonEmptyString,
            player_id  : field.nonEmptyString,
            quantity   : field.positiveInteger,
            ship_id    : field.nonEmptyString,
            side,
            station_id : field.nonEmptyString,
            total_price: field.positiveNumber,
            trade_id   : field.nonEmptyString,
            unit_price : field.positiveNumber,
        },
    },
    {
        type   : 'trade.rejected.v1',
        topic  : eventTopics.market,
        key    : keyBy('station_id'),
        payload: {
            good_id   : field.nonEmptyString,
            player_id : field.nonEmptyString,
            quantity  : field.positiveInteger,
            reason    : field.nonEmptyString,
            ship_id   : field.nonEmptyString,
            side,
            station_id: field.nonEmptyString,
        },
    },
    {
        type   : 'market.price.changed.v1',
        topic  : eventTopics.market,
        key    : keyBy('station_id'),
        payload: {
            buy_price : field.positiveNumber,
            good_id   : field.nonEmptyString,
            sell_price: field.positiveNumber,
            station_id: field.nonEmptyString,
        },
    },
]

export const eventDefinitions = freezeDefinitions(definitions)
export const eventTypes = freezeMap(
    definitions.map(def => [
        def.type.replaceAll('.', '_'),
        def.type,
    ]),
)

export function eventDefinition(etype) {
    return assertKnownDefinition(eventDefinitions, etype, 'event')
}

export function eventKey(e) {
    const def = eventDefinition(e.event_type)
    return def.key(e.payload)
}

export function eventTopic(etype) {
    return eventDefinition(etype).topic
}

export function validateEvent(e) {
    validateEnvelope(e, {
        id      : 'event_id',
        kind    : 'event_type',
        time    : 'occurred_at',
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

function cargoPayload() {
    return {
        good_id   : field.nonEmptyString,
        player_id : field.nonEmptyString,
        quantity  : field.positiveInteger,
        ship_id   : field.nonEmptyString,
        station_id: field.nonEmptyString,
    }
}

function walletTransactionPayload() {
    return {
        amount      : field.positiveNumber,
        balance     : field.nonNegativeNumber,
        player_id   : field.nonEmptyString,
        reference_id: field.nonEmptyString,
    }
}
