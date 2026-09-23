import { Universe, UniverseJSON } from './graph.js'
import { Good, GoodSeed } from './model.js'
import { Design, DesignSeed, Hull } from './modules.js'

/** what the wire carries about a good - the trade half of a catalogue row */
export type TradeView = GoodSeed

/** what the wire carries about a module - the fitting half */
export type DesignView = Omit<DesignSeed, keyof GoodSeed>

export interface Ship {
    name: string
    stid: string
    velocity: number
    acceleration: number
    capacity: number
}

export interface Constants {
    time_scale: number
    ansible_speed: number
    interest_rate: number
    starter_credits: number
    light_speed: number
    year_seconds: number
    currency: '₢'
}

declare const universe: Universe
export default universe

/** every good a station can sell - a commodity is a Good, a module a Design */
export declare const catalogue: Readonly<Record<string, Good | Design>>

/** the trade projection of `catalogue` */
export declare const goods: Readonly<Record<string, TradeView>>

export declare const starterShip: Readonly<Ship>

export declare const currency: '₢'
export declare const TIME_SCALE: number
/** a multiple of light speed */
export declare const ANSIBLE_SPEED: number
export declare const INTEREST_RATE: number
export declare const STARTER_CREDITS: number

/** the whole map and catalogue, as the client reads it */
export declare const universeData: UniverseJSON & {
    goods: Readonly<Record<string, TradeView>>
    hulls: Readonly<Record<'starter', Hull>>
    modules: Readonly<Record<string, DesignView>>
    starter: Ship
    constants: Constants
}
