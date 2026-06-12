import type { CommandTopic } from './topics.js'

export interface CommandPayloads {
    'player.register.requested.v1': {
        handle: string
        password: string
    }
    'wallet.debit.requested.v1': WalletTransactionRequestPayload
    'wallet.credit.requested.v1': WalletTransactionRequestPayload
    'ship.travel.requested.v1': {
        from_station_id: string
        player_id: string
        ship_id: string
        to_station_id: string
    }
    'cargo.load.requested.v1': CargoCommandPayload
    'cargo.unload.requested.v1': CargoCommandPayload
    'market.buy.requested.v1': {
        good_id: string
        max_unit_price: number
        player_id: string
        quantity: number
        ship_id: string
        station_id: string
    }
    'market.sell.requested.v1': {
        good_id: string
        min_unit_price: number
        player_id: string
        quantity: number
        ship_id: string
        station_id: string
    }
}

export interface CargoCommandPayload {
    good_id: string
    player_id: string
    quantity: number
    reference_id: string
    ship_id: string
    station_id: string
}

export interface WalletTransactionRequestPayload {
    amount: number
    player_id: string
    reason: string
    reference_id: string
}

export type CommandType = keyof CommandPayloads

export interface CommandEnvelope<T extends CommandType = CommandType> {
    command_id: string
    command_type: T
    requested_at: string
    requested_by: string
    correlation_id: string
    payload: CommandPayloads[T]
}

export type AnyCommandEnvelope = {
    [T in CommandType]: CommandEnvelope<T>
}[CommandType]

export interface CommandDefinition<T extends CommandType = CommandType> {
    type: T
    topic: CommandTopic
    key(payload: CommandPayloads[T]): string
    payload: Record<string, (value: unknown) => boolean>
}

export declare const commandDefinitions: Readonly<{
    [T in CommandType]: Readonly<CommandDefinition<T>>
}>

export declare const commandTypes: Readonly<{
    player_register_requested_v1: 'player.register.requested.v1'
    wallet_debit_requested_v1: 'wallet.debit.requested.v1'
    wallet_credit_requested_v1: 'wallet.credit.requested.v1'
    ship_travel_requested_v1: 'ship.travel.requested.v1'
    cargo_load_requested_v1: 'cargo.load.requested.v1'
    cargo_unload_requested_v1: 'cargo.unload.requested.v1'
    market_buy_requested_v1: 'market.buy.requested.v1'
    market_sell_requested_v1: 'market.sell.requested.v1'
}>

export function commandDefinition<T extends CommandType>(commandType: T): Readonly<CommandDefinition<T>>
export function commandKey(command: AnyCommandEnvelope): string
export function commandTopic(commandType: CommandType): CommandTopic
export function validateCommand<T extends AnyCommandEnvelope>(command: T): T
