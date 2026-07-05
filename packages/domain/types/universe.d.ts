export interface StationMeta {
    name?: string
    produces?: Record<string, number>
    consumes?: Record<string, number>
}

export interface Station extends StationMeta {
    stid: string
}

export declare class Universe {
    nodes: Map<string, Station>
    edges: Map<string, Map<string, number>>

    has(stid: string): boolean
    node(stid: string, meta?: StationMeta): Station
    link(a: string, b: string, ly: number): this
    neighbors(stid: string): Map<string, number>
    distance(from: string, to: string): number
}

declare const universe: Universe
export default universe

export interface Good {
    name: string
    price_base: number
    elasticity: number
}

export declare const goods: Readonly<Record<
    | 'ore'
    | 'grain'
    | 'spice',
    Good
>>

export declare const starterShip: Readonly<{
    name: string
    stid: string
    velocity: number
    capacity: number
}>
