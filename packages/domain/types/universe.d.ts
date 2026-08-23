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
    /** plain json shape - both directions of every link, one row each */
    toJSON(): UniverseJSON
}

declare const universe: Universe
export default universe

export interface Good {
    name: string
    price_base: number
    elasticity: number
}

export declare const TIME_SCALE: number
export declare const INTEREST_RATE: number
export declare const STARTER_CREDITS: number

export declare const currency: '₢'
export declare const universeData: UniverseJSON & {
    goods: Good
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
    | 'spice',
    Good
>>

export declare const starterShip: Readonly<Ship>
