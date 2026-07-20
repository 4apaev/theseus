export declare const commandTopics: Readonly<{
    cargo: 'commands.cargo'
    market: 'commands.market'
    player: 'commands.player'
    ship: 'commands.ship'
    wallet: 'commands.wallet'
}>

export declare const tree: Readonly<{
    player: {
        register: { requested: 'player.register.requested.v1' },
        login: { requested: 'player.login.requested.v1' }
    },
    wallet: {
        debit: { requested: 'wallet.debit.requested.v1' },
        credit: { requested: 'wallet.credit.requested.v1' }
    },
    ship: {
        travel: { requested: 'ship.travel.requested.v1' }
    },
    cargo: {
        load: { requested: 'cargo.load.requested.v1' },
        unload: { requested: 'cargo.unload.requested.v1' }
    },
    market: {
        buy: { requested: 'market.buy.requested.v1' },
        sell: { requested: 'market.sell.requested.v1' }
    },
}>

export type CommandTopic = typeof commandTopics[ keyof typeof commandTopics ]

export interface CommandPayloads {
    'player.register.requested.v1': {
        handle: string
        password: string
    }
    'player.login.requested.v1': {
        handle: string
        password: string
    }
    'wallet.debit.requested.v1': WalletTransactionRequestPayload
    'wallet.credit.requested.v1': WalletTransactionRequestPayload
    'ship.travel.requested.v1': {
        from: string
        pid: string
        sid: string
        to: string
    }
    'cargo.load.requested.v1': CargoCommandPayload
    'cargo.unload.requested.v1': CargoCommandPayload
    'market.buy.requested.v1': {
        gid: string
        price_unit_max: number
        pid: string
        quantity: number
        sid: string
        stid: string
    }
    'market.sell.requested.v1': {
        gid: string
        price_unit_min: number
        pid: string
        quantity: number
        sid: string
        stid: string
    }
}

export interface CargoCommandPayload {
    gid: string
    pid: string
    quantity: number
    rfid: string
    sid: string
    stid: string
}

export interface WalletTransactionRequestPayload {
    amount: number
    pid: string
    reason: string
    rfid: string
}

export type CommandType = keyof CommandPayloads

export interface CommandEnvelope<T extends CommandType = CommandType> {
    cmd: string
    command_type: T
    requested: string
    requested_by: string
    correlation_id: string
    payload: CommandPayloads[ T ]
}

export type AnyCommandEnvelope = {
    [ T in CommandType ]: CommandEnvelope<T>
}[ CommandType ]

export interface CommandDefinition<T extends CommandType = CommandType> {
    type: T
    topic: CommandTopic
    key(payload: CommandPayloads[ T ]): string
    payload: Record<string, (value: unknown) => boolean>
}

export declare const commandDefinitions: Readonly<{
    [ T in CommandType ]: Readonly<CommandDefinition<T>>
}>

export declare const commandTypes: Readonly<{
    player_register_requested_v1: 'player.register.requested.v1'
    player_login_requested_v1: 'player.login.requested.v1'
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
