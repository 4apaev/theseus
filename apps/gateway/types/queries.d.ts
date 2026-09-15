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

    hull      : string
    rig       : number
    power     : number
    power_pool: number

    departs   : Date | null
    arrives   : Date | null
    arrived   : Date | null
    updated   : Date | null
}

export interface FittedModuleRow {
    slot: string
    gid : string
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

// a dm has a to and no stid. station chat has a stid and no to.
export interface MessageRow {
    mid      : string
    from     : string
    to       : string | null
    stid     : string | null
    body     : string
    sent     : Date
    deliver  : Date
    delivered: Date | null
}

// public ship traffic - no pid, no capacity, no velocity.
// stid is null while the ship is in transit.
export interface TrafficRow {
    sid      : string
    handle   : string
    name     : string
    status   : string
    stid     : string | null
    from     : string | null
    to       : string | null
    years_abs: string | null
    arrives  : Date | null
    arrived  : Date | null
}

export interface EventLogRow {
    eid       : string
    event_type: string
    payload   : unknown
    occurred  : Date
    received  : Date
}

export interface InventoryRow {
    gid    : string
    stock  : number
    target : number
    updated: Date | null
}

export interface Queries {
    me(pid: string): Promise<PlayerOverview | undefined>
    ships(pid: string): Promise<ShipRow[]>
    modules(sid: string, pid: string): Promise<FittedModuleRow[]>
    trades(pid: string): Promise<TradeRow[]>
    market(stid: string): Promise<MarketPriceRow[]>
    cargo(sid: string, pid: string): Promise<CargoRow[]>

    /** sent by pid, received by pid, or station chat at pid's current dock */
    messages(pid: string): Promise<MessageRow[]>

    /** every ship when stid is omitted, the ships docked at stid otherwise */
    traffic(stid?: string): Promise<TrafficRow[]>

    // ── admin ────────────────────────────────────────────────
    allPlayers(): Promise<PlayerOverview[]>
    eventLog(): Promise<EventLogRow[]>
    inventory(stid: string): Promise<InventoryRow[]>
}

export interface QueryPool {
    query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>
}

export function createQueries(pool: QueryPool): Queries
