export type Weight = 'light' | 'medium' | 'heavy'
export type Context = 'field' | 'port' | 'dockyard'

export interface Slot {
    id: string
    family: string
    size: Weight
}

export interface Rate {
    rate: string
    rank?: number
}

export interface Effect {
    stat: string
    kind: 'flat' | 'percent'
    value: number
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

export interface RigContext {
    docked?: boolean
    dockyard?: boolean
}

export interface RigPreview {
    stats: Stats
    errors: string[]                 // empty when the operation is legal
    proposed: Record<string, string> // slot id -> gid aka good id
}

export interface CargoLine {
    gid: string
    quantity: number
}

/** slot id -> gid, the starter ship's day-1 rig */
export declare const starterRig  : Readonly<Record<string, string>>
export declare const hulls       : Readonly<Record<'starter', Hull>>
export declare const modules     : Readonly<Record<string, Design>>
export declare const slotFamilies: readonly string[]
export declare const mounts      : readonly [ 'light', 'medium', 'heavy' ]

export declare class Hull {
    constructor(hull: {
        id: string

        power_base: number
        capacity_base: number
        velocity_base: number

        power_max?: number
        capacity_max?: number
        velocity_max?: number

        rates?: Rate[]
        slots: Slot[]
    })

    id: string

    power_base: number
    capacity_base: number
    velocity_base: number

    power_max?: number
    capacity_max?: number
    velocity_max?: number

    rates: Rate[]
    slots: Slot[]
}

export declare class Design {
    constructor(design: {
        family: string
        mount: Weight
        power: number
        context?: Context
        requires?: Rate[]
        conflicts?: Rate[]
        provides?: Rate[]
        effects?: Effect[]
    })

    family: string
    power: number
    mount: Weight
    context: Context
    requires: Rate[]
    conflicts: Rate[]
    provides: Rate[]
    effects: Effect[]
}

/**
 * bound to one module catalogue - `fitting` is the real, live one
 */
export declare class Fitting {
    constructor(catalog?: Record<string, Design>)
    deriveStats(hull: Hull, fitted: Record<string, string>): Stats
    previewRig(
        hull: Hull,
        fitted: Record<string, string>,
        operation: Operation,
        context?: RigContext
    ): RigPreview
}


export declare const fitting: Fitting
export declare const deriveStats: Fitting[ 'deriveStats' ]
export declare const previewRig: Fitting[ 'previewRig' ]

export declare function cargoLoad(
    cargo: CargoLine[],
    goodsCatalog: Record<string, { volume: number }>
): number
