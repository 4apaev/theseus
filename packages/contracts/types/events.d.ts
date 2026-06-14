import type { EventTopic } from './topics.js'

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
        from_station: string
        pid: string
        sid: string
        to_station: string
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
    'trade.executed.v1': {
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
    'trade.rejected.v1': {
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
    payload: EventPayloads[T]
}

export type AnyEventEnvelope = {
    [T in EventType]: EventEnvelope<T>
}[EventType]

export interface EventDefinition<T extends EventType = EventType> {
    type: T
    topic: EventTopic
    key(payload: EventPayloads[T]): string
    payload: Record<string, (value: unknown) => boolean>
}

export declare const eventDefinitions: Readonly<{
    [T in EventType]: Readonly<EventDefinition<T>>
}>

export declare const eventTypes: Readonly<{
    player_created_v1: 'player.created.v1'
    player_registration_rejected_v1: 'player.registration.rejected.v1'
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
    trade_executed_v1: 'trade.executed.v1'
    trade_rejected_v1: 'trade.rejected.v1'
    market_price_changed_v1: 'market.price.changed.v1'
}>

export function eventDefinition<T extends EventType>(eventType: T): Readonly<EventDefinition<T>>
export function eventKey(event: AnyEventEnvelope): string
export function eventTopic(eventType: EventType): EventTopic
export function validateEvent<T extends AnyEventEnvelope>(event: T): T
