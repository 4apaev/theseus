export interface SystemMeta {
    name?: string
    /** the spectral class, for flavour */
    star?: string
}

/** what the graph stores for one system */
export interface SystemNode extends SystemMeta {
    sysid: string
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

/** what the graph stores for one station */
export interface StationNode extends StationMeta {
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
    systems: SystemNode[]
    stations: StationNode[]
    routes: Route[]
}

export declare class Universe {
    systems: Map<string, SystemNode>
    nodes: Map<string, StationNode>
    edges: Map<string, Map<string, Edge>>

    has(stid: string): boolean
    system(sysid: string, meta?: SystemMeta): SystemNode
    node(stid: string, meta: StationMeta): StationNode
    link(a: string, b: string, ly: number, c?: number): this
    neighbors(stid: string): Map<string, Edge>
    route(from: string, to: string): Edge
    distance(from: string, to: string): number
    distanceTo(from: string, to: string): number
    speedLimit(from: string, to: string): number

    /**
     *  dijkstra, weighted by travel time - `legTime()`, not by `ly`
     *  alone. the winning route can change with the ship.
     *  returns the ordered stids from `from` to `to`, both included,
     *  or undefined when no route connects them. */
    path(from: string, to: string, velocity: number, acceleration: number): string[] | undefined

    /** plain json shape - both directions of every link, one row each */
    toJSON(): UniverseJSON
}
