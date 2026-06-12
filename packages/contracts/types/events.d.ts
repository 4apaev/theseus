import type { EventTopic } from './topics.js'

export type TradeSide = 'buy' | 'sell'

export interface EventPayloads {
    'player.created.v1': {
        handle: string
        player_id: string
    }
    'player.registration.rejected.v1': {
        handle: string
        reason: string
    }
    'wallet.created.v1': {
        balance: number
        player_id: string
    }
    'wallet.debited.v1': WalletTransactionPayload
    'wallet.credited.v1': WalletTransactionPayload
    'wallet.transaction.rejected.v1': {
        amount: number
        player_id: string
        reason: string
        reference_id: string
    }
    'ship.created.v1': {
        cargo_capacity: number
        name: string
        player_id: string
        ship_id: string
        station_id: string
        velocity_c: number
    }
    'ship.departed.v1': {
        arrives_at: string
        common_frame_years: number
        departed_at: string
        from_station_id: string
        player_id: string
        ship_frame_years: number
        ship_id: string
        to_station_id: string
    }
    'ship.arrived.v1': {
        arrived_at: string
        player_id: string
        ship_id: string
        station_id: string
    }
    'ship.travel.rejected.v1': {
        player_id: string
        reason: string
        ship_id: string
    }
    'cargo.loaded.v1': CargoPayload
    'cargo.unloaded.v1': CargoPayload
    'cargo.operation.rejected.v1': {
        good_id?: string
        player_id: string
        quantity?: number
        reason: string
        ship_id: string
    }
    'trade.executed.v1': {
        good_id: string
        player_id: string
        quantity: number
        ship_id: string
        side: TradeSide
        station_id: string
        total_price: number
        trade_id: string
        unit_price: number
    }
    'trade.rejected.v1': {
        good_id: string
        player_id: string
        quantity: number
        reason: string
        ship_id: string
        side: TradeSide
        station_id: string
    }
    'market.price.changed.v1': {
        buy_price: number
        good_id: string
        sell_price: number
        station_id: string
    }
}

export interface CargoPayload {
    good_id: string
    player_id: string
    quantity: number
    ship_id: string
    station_id: string
}

export interface WalletTransactionPayload {
    amount: number
    balance: number
    player_id: string
    reference_id: string
}

export type EventType = keyof EventPayloads

export interface EventEnvelope<T extends EventType = EventType> {
    event_id: string
    event_type: T
    aggregate_type: string
    aggregate_id: string
    aggregate_version: number
    occurred_at: string
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
