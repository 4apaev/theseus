export interface Slot {
    id: string
    family: string
    size: 'light' | 'medium' | 'heavy'
}

export interface Requirement {
    capability: string
    rank: number
}

export interface Effect {
    stat: string
    kind: 'flat' | 'percent'
    value: number
}

export interface Hull {
    id: string

    power_base: number
    capacity_base: number
    velocity_base: number

    power_max?: number
    capacity_max?: number
    velocity_max?: number

    capabilities: Requirement[]
    slots: Slot[]
}

export interface Design {
    family: string
    power: number
    mount: 'light' | 'medium' | 'heavy'
    context: 'field' | 'port' | 'dockyard'
    requires: Requirement[]
    conflicts: Requirement[]
    provides: Requirement[]
    effects: Effect[]
}

export interface Stats {
    capacity: number
    velocity: number
    power: {
        used: number,
        available: number,
    }
}

export interface Operation {
    type: 'install' | 'remove'
    slot: string
    gid?: string
}

export interface LoadoutContext {
    docked?: boolean
    dockyard?: boolean
}

export interface LoadoutPreview {
    /** slot id -> gid aka good is */
    proposed: Record<string, string>
    stats: Stats
    /** empty when the operation is legal */
    errors: string[]
}

export interface CargoLine {
    gid: string
    quantity: number
}

/** slot id -> gid, the starter ship's day-1 loadout */
export declare const starterLoadout: Readonly<Record<string, string>>
export declare const hulls         : Readonly<Record<'starter', Hull>>
export declare const modules       : Readonly<Record<string, Design>>
export declare const slotFamilies  : readonly string[]
export declare const mounts        : readonly [ 'light', 'medium', 'heavy' ]


/**
 * bound to one module catalogue - `fitting` is the real, live one
 */
export declare class Fitting {
    constructor(catalog?: Record<string, Design>)
    deriveStats(hull: Hull, fitted: Record<string, string>): Stats
    previewLoadout(
        hull: Hull,
        fitted: Record<string, string>,
        operation: Operation,
        context?: LoadoutContext
    ): LoadoutPreview
}

export declare const fitting: Fitting
export declare const deriveStats: Fitting[ 'deriveStats' ]
export declare const previewLoadout: Fitting[ 'previewLoadout' ]

export declare function cargoLoad(
    cargo: CargoLine[],
    goodsCatalog: Record<string, { volume: number }>
): number
