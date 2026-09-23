export type Kind = 'commodity' | 'module'

/** one row of the goods seed */
export interface GoodSeed {
    name: string
    price_base: number
    elasticity: number
    /** hold space for one unit */
    volume: number
    kind: Kind
}

/** one orbit of the systems seed */
export interface StationSeed {
    name: string
    /** mean orbit radius, in AU */
    au: number
    /** gid → rate per tick */
    produces?: Record<string, number>
    /** gid → rate per tick */
    consumes?: Record<string, number>
    /** module gids sold here */
    stocks?: string[]
}

/** one system of the systems seed */
export interface SystemSeed {
    name: string
    /** the spectral class, for flavour */
    star: string
    /** one of its own stations. it holds the links to the other stars */
    gateway: string
    /** stid → orbit */
    orbits: Record<string, StationSeed>
    /** which 2 stations link. the distance derives from the 2 radii */
    links?: [ string, string ][]
}

/** a tradable good. price_base and elasticity drive the price curve */
export declare class Good {
    constructor(gid: string, raw: GoodSeed)

    gid: string
    name: string
    price_base: number
    elasticity: number
    volume: number
    kind: Kind
}

/** a station at one orbit radius. the radius is its whole position */
export declare class Station {
    constructor(stid: string, raw: StationSeed)

    stid: string
    name: string
    au: number
    produces: Record<string, number>
    consumes: Record<string, number>
    stocks: string[]
}

/** a star and the stations in orbit around it */
export declare class System {
    constructor(sysid: string, raw: SystemSeed)

    sysid: string
    name: string
    star: string
    gateway: string
    /** in orbit order, the nearest radius first */
    stations: Station[]

    /** true when the system holds more than a gateway */
    readonly well: boolean
}
