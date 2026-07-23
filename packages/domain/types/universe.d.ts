export interface StationMeta {
    name?: string
    produces?: Record<string, number>
    consumes?: Record<string, number>
}

export interface Station extends StationMeta {
    stid: string
}

export interface Route {
    from: string
    to: string
    ly: number
}

export interface UniverseJSON {
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
    nodes: Map<string, Station>
    edges: Map<string, Map<string, number>>

    has(stid: string): boolean
    node(stid: string, meta?: StationMeta): Station
    link(a: string, b: string, ly: number): this
    neighbors(stid: string): Map<string, number>
    distance(from: string, to: string): number
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
