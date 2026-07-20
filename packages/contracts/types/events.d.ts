export declare const eventTopics: Readonly<{
    all: 'events.all'
    cargo: 'events.cargo'
    market: 'events.market'
    player: 'events.player'
    ship: 'events.ship'
    wallet: 'events.wallet'
}>

export declare const tree: Readonly<{
    player: {
        created: 'player.created.v1',
        registration: { rejected: 'player.registration.rejected.v1' },
        login: {
            succeeded: 'player.login.succeeded.v1',
            rejected: 'player.login.rejected.v1',
        },
    },
    wallet: {
        created: 'wallet.created.v1',
        debited: 'wallet.debited.v1',
        credited: 'wallet.credited.v1',
        transaction: { rejected: 'wallet.transaction.rejected.v1' },
    },
    ship: {
        created: 'ship.created.v1',
        departed: 'ship.departed.v1',
        arrived: 'ship.arrived.v1',
        travel: { rejected: 'ship.travel.rejected.v1' },
    },
    cargo: {
        loaded: 'cargo.loaded.v1',
        unloaded: 'cargo.unloaded.v1',
        operation: { rejected: 'cargo.operation.rejected.v1' },
    },
    market: {
        price: {
            changed: 'market.price.changed.v1',
        },
    },
    trade: {
        executed: 'market.trade.executed.v1',
        rejected: 'market.trade.rejected.v1',
    },
}>

export type EventTopic = typeof eventTopics[ keyof typeof eventTopics ]

export type TradeSide = 'buy' | 'sell'

export interface EventPayloads {
    'player.created.v1': {
        handle: string
        pid: string
    }
    'player.registration.rejected.v1': {
        handle: string
        reason: string
    }
    'player.login.succeeded.v1': {
        handle: string
        pid: string
    }
    'player.login.rejected.v1': {
        handle: string
        reason: string
    }
    'wallet.created.v1': {
        balance: number
        pid: string
    }
    'wallet.debited.v1': WalletTransactionPayload
    'wallet.credited.v1': WalletTransactionPayload
    'wallet.transaction.rejected.v1': {
        amount: number
        pid: string
        reason: string
        rfid: string
    }
    'ship.created.v1': {
        capacity: number
        name: string
        pid: string
        sid: string
        stid: string
        velocity: number
    }
    'ship.departed.v1': {
        arrives: string
        departed: string
        from: string
        pid: string
        sid: string
        to: string
        years_abs: number
        years_rel: number
    }
    'ship.arrived.v1': {
        arrived: string
        pid: string
        sid: string
        stid: string
    }
    'ship.travel.rejected.v1': {
        pid: string
        reason: string
        sid: string
    }
    'cargo.loaded.v1': CargoPayload
    'cargo.unloaded.v1': CargoPayload
    'cargo.operation.rejected.v1': {
        gid?: string
        pid: string
        quantity?: number
        reason: string
        sid: string
    }
    'market.trade.executed.v1': {
        gid: string
        pid: string
        price_total: number
        price_unit: number
        quantity: number
        sid: string
        side: TradeSide
        stid: string
        tid: string
    }
    'market.trade.rejected.v1': {
        gid: string
        pid: string
        quantity: number
        reason: string
        sid: string
        side: TradeSide
        stid: string
    }
    'market.price.changed.v1': {
        gid: string
        price_buy: number
        price_sell: number
        stid: string
    }
}

export interface CargoPayload {
    gid: string
    pid: string
    quantity: number
    sid: string
    stid: string
}

export interface WalletTransactionPayload {
    amount: number
    balance: number
    pid: string
    rfid: string
}

export type EventType = keyof EventPayloads

export interface EventEnvelope<T extends EventType = EventType> {
    eid: string
    event_type: T
    aggregate_type: string
    aggregate_id: string
    aggregate_version: number
    occurred: string
    causation_id?: string
    correlation_id: string
    producer: string
    payload: EventPayloads[ T ]
}

export type AnyEventEnvelope = {
    [ T in EventType ]: EventEnvelope<T>
}[ EventType ]

export interface EventDefinition<T extends EventType = EventType> {
    type: T
    topic: EventTopic
    key(payload: EventPayloads[ T ]): string
    payload: Record<string, (value: unknown) => boolean>
}

export declare const eventDefinitions: Readonly<{
    [ T in EventType ]: Readonly<EventDefinition<T>>
}>

export declare const eventTypes: Readonly<{
    player_created_v1: 'player.created.v1'
    player_registration_rejected_v1: 'player.registration.rejected.v1'
    player_login_succeeded_v1: 'player.login.succeeded.v1'
    player_login_rejected_v1: 'player.login.rejected.v1'
    wallet_created_v1: 'wallet.created.v1'
    wallet_debited_v1: 'wallet.debited.v1'
    wallet_credited_v1: 'wallet.credited.v1'
    wallet_transaction_rejected_v1: 'wallet.transaction.rejected.v1'
    ship_created_v1: 'ship.created.v1'
    ship_departed_v1: 'ship.departed.v1'
    ship_arrived_v1: 'ship.arrived.v1'
    ship_travel_rejected_v1: 'ship.travel.rejected.v1'
    cargo_loaded_v1: 'cargo.loaded.v1'
    cargo_unloaded_v1: 'cargo.unloaded.v1'
    cargo_operation_rejected_v1: 'cargo.operation.rejected.v1'
    market_trade_executed_v1: 'market.trade.executed.v1'
    market_trade_rejected_v1: 'market.trade.rejected.v1'
    market_price_changed_v1: 'market.price.changed.v1'
}>

export function eventDefinition<T extends EventType>(eventType: T): Readonly<EventDefinition<T>>
export function eventKey(event: AnyEventEnvelope): string
export function eventTopic(eventType: EventType): EventTopic
export function validateEvent<T extends AnyEventEnvelope>(event: T): T
