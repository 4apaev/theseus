// projection read-model rows: pg returns numeric as string, timestamp as Date

export interface PlayerOverview {
    pid    : string
    handle : string
    balance: string
    created: Date
}

export interface ShipRow {
    sid       : string
    name      : string
    status    : string
    stid      : string | null
    from      : string | null
    to        : string | null
    years_abs : string | null
    years_rel : string | null

    velocity  : string
    capacity  : number

    departs   : Date | null
    arrives   : Date | null
    arrived   : Date | null
    updated   : Date | null
}

export interface CargoRow {
    gid     : string
    quantity: number
    updated : Date | null
}

export interface MarketPriceRow {
    gid       : string
    price_buy : string
    price_sell: string
    updated   : Date | null
}

export interface TradeRow {
    tid        : string
    gid        : string
    sid        : string
    stid       : string
    price_unit : string
    price_total: string
    quantity   : number
    side       : 'buy' | 'sell'
    created    : Date
}

export interface Queries {
    me(pid: string): Promise<PlayerOverview | undefined>
    ships(pid: string): Promise<ShipRow[]>
    trades(pid: string): Promise<TradeRow[]>
    market(stid: string): Promise<MarketPriceRow[]>
    cargo(sid: string, pid: string): Promise<CargoRow[]>
}

export interface QueryPool {
    query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>
}

export function createQueries(pool: QueryPool): Queries
