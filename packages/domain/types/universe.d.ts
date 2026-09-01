export interface System {
    sysid: string
    name?: string
    /** the spectral class, for flavour */
    star?: string
}

export interface StationMeta {
    /** the sysid of the system that holds this station */
    system: string
    name?: string
    produces?: Record<string, number>
    consumes?: Record<string, number>
    /** module gids this station stocks - sparse, unlike commodities */
    stocks?: string[]
}

export interface Station extends StationMeta {
    stid: string
}

/** one undirected link, as stored on both ends */
export interface Edge {
    ly: number
    /** speed limit, in fractions of light speed. 1 lets the ship decide */
    c: number
}

export interface Route extends Edge {
    from: string
    to: string
}

export interface UniverseJSON {
    systems: System[]
    stations: Station[]
    routes: Route[]
}

export interface Ship {
    name: string
    stid: string
    velocity: number
    capacity: number
}

export declare class Universe {
    systems: Map<string, System>
    nodes: Map<string, Station>
    edges: Map<string, Map<string, Edge>>

    has(stid: string): boolean
    system(sysid: string, meta?: Omit<System, 'sysid'>): System
    node(stid: string, meta: StationMeta): Station
    link(a: string, b: string, ly: number, c?: number): this
    neighbors(stid: string): Map<string, Edge>
    route(from: string, to: string): Edge
    distance(from: string, to: string): number
    speedLimit(from: string, to: string): number
    /**
     *  dijkstra, weighted by travel time - `ly / min(velocity, c)`,
     *  not by `ly` alone. the winning route can change with the ship.
     *  returns the ordered stids from `from` to `to`, both included,
     *  or null when no route connects them. */
    path(from: string, to: string, velocity: number): string[] | undefined
    /** plain json shape - both directions of every link, one row each */
    toJSON(): UniverseJSON
}

declare const universe: Universe
export default universe

export interface Good {
    name: string
    price_base: number
    elasticity: number
    kind: 'commodity' | 'module'
    volume: number
}

export declare const TIME_SCALE: number
export declare const INTEREST_RATE: number
export declare const STARTER_CREDITS: number

export declare const currency: '₢'
export declare const universeData: UniverseJSON & {
    goods: Good
    hulls: import('./modules.js').Hull
    modules: import('./modules.js').Design
    starter: Ship
    constants: {
        time_scale: number
        interest_rate: number
        starter_credits: number
        currency: '₢'
    }
}

export declare const goods: Readonly<Record<
    | 'ore'
    | 'grain'
    | 'spice'
    | 'reactor.mk1'
    | 'reactor.mk2'
    | 'cruise.mk1'
    | 'cruise.mk2'
    | 'cargo.mk1'
    | 'cargo.mk2',
    Good
>>

export declare const starterShip: Readonly<Ship>
