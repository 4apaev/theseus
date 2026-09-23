import { Good, GoodSeed } from './model.js'

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
    acceleration: number
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

/** one row of the hulls seed */
export interface HullSeed {
    id: string

    power_base: number
    capacity_base: number
    velocity_base: number
    acceleration_base: number

    power_max?: number
    capacity_max?: number
    velocity_max?: number
    acceleration_max?: number

    rates?: Rate[]
    slots: Slot[]
}

export declare class Hull {
    constructor(hull: HullSeed)

    id: string

    power_base: number
    capacity_base: number
    velocity_base: number
    acceleration_base: number

    power_max?: number
    capacity_max?: number
    velocity_max?: number
    acceleration_max?: number

    rates: readonly Rate[]
    slots: readonly Slot[]
}

/** one row of the modules seed - the trade half and the fitting half */
export interface DesignSeed extends Omit<GoodSeed, 'kind'> {
    /** one of `slotFamilies` */
    family: string
    mount: Weight
    /** draw, 0 for none */
    power: number
    /** where it may be installed or removed */
    context?: Context
    requires?: Rate[]
    conflicts?: Rate[]
    provides?: Rate[]
    effects?: Effect[]
}

/** a module is a good with a fitting */
export declare class Design extends Good {
    constructor(gid: string, design: DesignSeed)

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


/** slot id -> gid, the starter ship's day-1 rig */
export declare const starterRig  : Readonly<Record<string, string>>
export declare const hulls       : Readonly<Record<'starter', Hull>>
export declare const modules     : Readonly<Record<string, Design>>
export declare const slotFamilies: readonly string[]
export declare const mounts      : readonly [ 'light', 'medium', 'heavy' ]

export declare const fitting: Fitting
export declare const deriveStats: Fitting[ 'deriveStats' ]
export declare const previewRig: Fitting[ 'previewRig' ]

export declare function cargoLoad(
    cargo: CargoLine[],
    goodsCatalog: Record<string, { volume: number }>
): number

export declare function previewExchange(
    load: number,
    goodsCatalog: Record<string, { volume: number }>,
    exchange: { incoming?: string, outgoing?: string }
): number
