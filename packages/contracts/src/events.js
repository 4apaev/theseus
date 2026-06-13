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
        key    : keyBy('pid'),
        payload: {
            handle: field.nonEmptyString,
            pid   : field.nonEmptyString,
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
        key    : keyBy('pid'),
        payload: {
            balance: field.nonNegativeNumber,
            pid    : field.nonEmptyString,
        },
    },
    {
        type   : 'wallet.debited.v1',
        topic  : eventTopics.wallet,
        key    : keyBy('pid'),
        payload: walletTransactionPayload(),
    },
    {
        type   : 'wallet.credited.v1',
        topic  : eventTopics.wallet,
        key    : keyBy('pid'),
        payload: walletTransactionPayload(),
    },
    {
        type   : 'wallet.transaction.rejected.v1',
        topic  : eventTopics.wallet,
        key    : keyBy('pid'),
        payload: {
            amount      : field.positiveNumber,
            pid         : field.nonEmptyString,
            reason      : field.nonEmptyString,
            reference_id: field.nonEmptyString,
        },
    },
    {
        type   : 'ship.created.v1',
        topic  : eventTopics.ship,
        key    : keyBy('sid'),
        payload: {
            capacity: field.positiveInteger,
            name    : field.nonEmptyString,
            pid     : field.nonEmptyString,
            sid     : field.nonEmptyString,
            stid    : field.nonEmptyString,
            velocity: field.velocity,
        },
    },
    {
        type   : 'ship.departed.v1',
        topic  : eventTopics.ship,
        key    : keyBy('sid'),
        payload: {
            arrives           : field.isoTime,
            common_frame_years: field.positiveNumber,
            departed          : field.isoTime,
            from_station      : field.nonEmptyString,
            pid               : field.nonEmptyString,
            ship_frame_years  : field.positiveNumber,
            sid               : field.nonEmptyString,
            to_station        : field.nonEmptyString,
        },
    },
    {
        type   : 'ship.arrived.v1',
        topic  : eventTopics.ship,
        key    : keyBy('sid'),
        payload: {
            arrived: field.isoTime,
            pid    : field.nonEmptyString,
            sid    : field.nonEmptyString,
            stid   : field.nonEmptyString,
        },
    },
    {
        type   : 'ship.travel.rejected.v1',
        topic  : eventTopics.ship,
        key    : keyBy('sid'),
        payload: {
            pid   : field.nonEmptyString,
            reason: field.nonEmptyString,
            sid   : field.nonEmptyString,
        },
    },
    {
        type   : 'cargo.loaded.v1',
        topic  : eventTopics.cargo,
        key    : keyBy('sid'),
        payload: cargoPayload(),
    },
    {
        type   : 'cargo.unloaded.v1',
        topic  : eventTopics.cargo,
        key    : keyBy('sid'),
        payload: cargoPayload(),
    },
    {
        type   : 'cargo.operation.rejected.v1',
        topic  : eventTopics.cargo,
        key    : keyBy('sid'),
        payload: {
            gid     : field.optionalNonEmptyString,
            pid     : field.nonEmptyString,
            quantity: field.optionalPositiveInteger,
            reason  : field.nonEmptyString,
            sid     : field.nonEmptyString,
        },
    },
    {
        type   : 'trade.executed.v1',
        topic  : eventTopics.market,
        key    : keyBy('stid'),
        payload: {
            gid        : field.nonEmptyString,
            pid        : field.nonEmptyString,
            quantity   : field.positiveInteger,
            sid        : field.nonEmptyString,
            side,
            stid       : field.nonEmptyString,
            total_price: field.positiveNumber,
            trade_id   : field.nonEmptyString,
            unit_price : field.positiveNumber,
        },
    },
    {
        type   : 'trade.rejected.v1',
        topic  : eventTopics.market,
        key    : keyBy('stid'),
        payload: {
            gid     : field.nonEmptyString,
            pid     : field.nonEmptyString,
            quantity: field.positiveInteger,
            reason  : field.nonEmptyString,
            sid     : field.nonEmptyString,
            side,
            stid    : field.nonEmptyString,
        },
    },
    {
        type   : 'market.price.changed.v1',
        topic  : eventTopics.market,
        key    : keyBy('stid'),
        payload: {
            buy_price : field.positiveNumber,
            gid       : field.nonEmptyString,
            sell_price: field.positiveNumber,
            stid      : field.nonEmptyString,
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

function cargoPayload() {
    return {
        gid     : field.nonEmptyString,
        pid     : field.nonEmptyString,
        quantity: field.positiveInteger,
        sid     : field.nonEmptyString,
        stid    : field.nonEmptyString,
    }
}

function walletTransactionPayload() {
    return {
        amount      : field.positiveNumber,
        balance     : field.nonNegativeNumber,
        pid         : field.nonEmptyString,
        reference_id: field.nonEmptyString,
    }
}
