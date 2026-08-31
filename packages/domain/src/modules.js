// @ts-check

import {
    A, O,
    Fail,
} from '@theseus/util'

/**
 * @see {@link docs/modules.md}
 * @description ship modules - pure catalogue + resolver, no io.
 *
 * a module design is not a `good` (universe.js's `goods`).
 * the design holds family/mount/power/requirements/effects.
 * the good holds name/price/kind/volume. they join on a shared gid.
 * this file imports nothing from universe.js, so universe.js
 * can freely import catalogues from here with no import cycle.
 * universeData serves this whole catalogue to the client over json.
 */

// ─────────────────────────────────────────────────────────────

/**
 * one module design - immutable once constructed.
 * a bad or missing field throws here, not on first use.
 */
export class Design {
    /**
     * @param {object} design
     * @param {string} design.family  - one of {@link slotFamilies}
     * @param {Weight} design.mount
     * @param {number} design.power   - draw, 0 for none
     * @param {'field'|'port'|'dockyard'} [design.context] - where it may be (un)installed
     * @param {Rate[]} [design.requires]
     * @param {Rate[]} [design.conflicts]
     * @param {Rate[]} [design.provides]
     * @param {Effect[]} [design.effects]
     */
    constructor({
        family,
        mount,
        power,
        context = 'port',
        requires = [],
        conflicts = [],
        provides = [],
        effects = [],
    }) {
        family        || Fail.raise('module design needs a family')
        mount         || Fail.raise('module design needs a mount size')
        power == null && Fail.raise('module design needs a power draw')

        this.family    = family
        this.mount     = mount
        this.power     = power
        this.context   = context
        this.requires  = O.freeze(A.from(requires))
        this.conflicts = O.freeze(A.from(conflicts))
        this.provides  = O.freeze(A.from(provides))
        this.effects   = O.freeze(A.from(effects))
        O.freeze(this)
    }
}

/**
 * one ship hull - base stats, slots and rates. immutable once
 * constructed.
 */
export class Hull {
    /**
     *  a single hull object, read by property rather than destructured -
     *  its stat fields are snake_case (they mirror the ship row's own
     *  columns), and this project's camelcase rule only exempts property
     *  names, not local variables a destructure would bind them to
     *
     * @param {object}  hull
     * @param {string}  hull.id
     * @param {number}  hull.power_base
     * @param {number}  hull.capacity_base
     * @param {number}  hull.velocity_base
     * @param {number} [hull.power_max]
     * @param {number} [hull.capacity_max]
     * @param {number} [hull.velocity_max]
     * @param {Rate[]} [hull.rates]
     * @param {Slot[]}  hull.slots
     */
    constructor(hull) {
        hull.id            || Fail.raise('hull needs an id')
        hull.slots?.length || Fail.raise(`hull ${ hull.id } needs at least one slot`)

        this.id            = hull.id
        this.power_base    = hull.power_base
        this.capacity_base = hull.capacity_base
        this.velocity_base = hull.velocity_base
        this.capacity_max  = hull.capacity_max
        this.velocity_max  = hull.velocity_max
        this.power_max     = hull.power_max
        this.rates = /** @type {readonly Rate[]} */ (O.freeze(A.from(hull.rates ?? [], O.freeze)))
        this.slots = /** @type {readonly Slot[]} */ (O.freeze(A.from(hull.slots, O.freeze)))
        O.freeze(this)
    }
}

/**
 * bound to one module catalogue - `fitting` below is the real, live
 * one. tests construct their own instance with a toy catalogue.
 */
export class Fitting {
    #catalog

    /** @param {Record<string, Design>} [catalog] */
    constructor(catalog = modules) {
        this.#catalog = catalog
    }

    /**
     * hull base + flat additions + percent modifiers = hull maximum.
     * order-independent: every fold below is a sum or a max.
     *
     * @param {Hull} hull
     * @param {Record<string, string>} fitted - slot id -> gid
     * @return {Stats}
     */
    deriveStats(hull, fitted) {
        const designs = O.values(fitted).map(gid => this.#catalog[ gid ]).filter(Boolean)

        return {
            capacity: resolve(hull.capacity_base, hull.capacity_max ?? Infinity, designs, 'capacity'),
            velocity: resolve(hull.velocity_base, hull.velocity_max ?? Infinity, designs, 'velocity'),
            power   : {
                available: resolve(hull.power_base, hull.power_max ?? Infinity, designs, 'power'),
                used     : designs.reduce((n, d) => n + d.power, 0),
            },
        }
    }

    /**
     * preview one install or remove against a hull + its current rig.
     * requirements inspect the proposed final rig only, never history.
     * returns every violation, not just the first.
     *
     * @param {Hull} hull
     * @param {Record<string, string>} fitted - slot id -> gid
     * @param {Operation} opr
     * @param {RigContext} [ctx]
     * @return {RigPreview}
     */
    previewRig(hull, fitted, opr, ctx = {}) {
        opr.type === 'install'
            || opr.type === 'remove'
            || Fail.raise(`unknown operation type: ${ opr.type }`)

        const proposed = applyOperation(fitted, opr)
        const errors   = [
            ...this.#operationErrors(hull, fitted, opr, ctx),
            ...this.#requirementErrors(hull, proposed),
        ]

        const stats = this.deriveStats(hull, proposed)
        stats.power.used <= stats.power.available
            || errors.push(`power draw ${ stats.power.used } exceeds ${ stats.power.available } available`)

        return { proposed, stats, errors }
    }

    /**
     * @param {Hull} hull
     * @param {Record<string, string>} fitted
     * @param {Partial<Operation>} opr
     * @param {RigContext} ctx
     * @return {string[]}
     */
    #operationErrors(hull, fitted, opr, ctx) {
        return opr.type === 'install'
            ? this.#installErrors(hull, opr, ctx)
            : this.#removeErrors(fitted, opr, ctx)
    }

    /**
     * @param {Hull} hull
     * @param {Partial<Operation>} opr
     * @param {RigContext} ctx
     * @return {string[]}
     */
    #installErrors(hull, opr, ctx) {
        const { slot: slotId, gid } = opr
        const slot   = hull.slots.find(s => s.id === slotId)
        const design = this.#catalog[ gid ]
        const errors = []

        if (!slot)   errors.push(`unknown slot: ${ slotId }`)
        if (!design) errors.push(`unknown module: ${ gid }`)
        if (!slot || !design) return errors

        slot.family === design.family                     || errors.push(`${ gid } does not fit the ${ slot.family } slot`)
        mountIndex(design.mount) <= mountIndex(slot.size) || errors.push(`${ gid } is too large for slot ${ slot.id }`)
        legalContext(ctx, design.context)      || errors.push(`${ gid } requires ${ design.context }`)
        return errors
    }

    /**
     * @param {Record<string, string>} fitted
     * @param {Partial<Operation>} opr
     * @param {RigContext} ctx
     * @return {string[]}
     */
    #removeErrors(fitted, { slot: slotId }, ctx) {
        const outgoing = this.#catalog[ fitted[ slotId ] ]
        if (!outgoing) return [ `nothing fitted at slot ${ slotId }` ]

        return legalContext(ctx, outgoing.context)
            ? []
            : [ `removing ${ fitted[ slotId ] } requires ${ outgoing.context }` ]
    }

    /**
     * @param {Hull} hull
     * @param {Record<string, string>} proposed
     * @return {string[]}
     */
    #requirementErrors(hull, proposed) {
        const ranks  = this.#rateRanks(hull, proposed)
        const errors = []

        for (const gid of O.values(proposed)) {
            const d = this.#catalog[ gid ]
            if (!d) continue

            for (const req of d.requires) {
                (ranks.get(req.rate) ?? 0) >= req.rank
                    || errors.push(`${ gid } needs ${ req.rate } ${ req.rank }`)
            }

            for (const c of d.conflicts)
                !conflicting(ranks, c) || errors.push(`${ gid } conflicts with ${ c.rate }`)
        }
        return errors
    }

    /**
     * @param {Hull} hull
     * @param {Record<string, string>} proposed
     * @return {Map<string, number>}
     */
    #rateRanks(hull, proposed) {
        const ranks = new Map(hull.rates.map(c => [ c.rate, c.rank ]))

        for (const gid of O.values(proposed)) {
            const d = this.#catalog[ gid ]
            if (!d) continue
            for (const { rate, rank } of d.provides)
                (ranks.get(rate) ?? 0) >= rank || ranks.set(rate, rank)
        }
        return ranks
    }
}

// ─────────────────────────────────────────────────────────────

// mount sizes, a slot accepts its own size and anything smaller
export const mounts = O.freeze(A.of('light', 'medium', 'heavy'))

// the 8 slot families from docs/modules.md - client ordering
export const slotFamilies = O.freeze(A.of(
    'power', 'cruise',
    'maneuver', 'cargo',
    'utility', 'hardpoint',
    'external', 'cosmetic',
))

/** @type {Record<string, Design>} */
export const modules = O.freeze(O.setPrototypeOf({
    'reactor.mk1': new Design({ family: 'power', mount: 'light', power: 1, provides: [{ rate: 'power', rank: 1 }], effects: [{ stat: 'power', kind: 'flat', value: 5 }]}),
    'reactor.mk2': new Design({ family: 'power', mount: 'light', power: 2, provides: [{ rate: 'power', rank: 2 }], effects: [{ stat: 'power', kind: 'flat', value: 9 }]}),

    // needs reactor.mk2's power rank - a real dependency, not history
    'cruise.mk1': new Design({ family: 'cruise', mount: 'light', power: 1 }),
    'cruise.mk2': new Design({ family: 'cruise', mount: 'light', power: 2, requires: [{ rate: 'power', rank: 2 }], effects: [{ stat: 'velocity', kind: 'percent', value: 0.08 }]}),

    'cargo.mk1': new Design({ family: 'cargo', mount: 'light', power: 0 }),
    'cargo.mk2': new Design({ family: 'cargo', mount: 'light', power: 1, effects: [{ stat: 'capacity', kind: 'flat', value: 10 }]}),
}, null))

/** @type {Record<'starter', Hull>} */
export const hulls = O.freeze(O.setPrototypeOf({
    starter: new Hull({
        id           : 'starter',
        power_base   : 3,
        capacity_base: 20,
        velocity_base: 0.6,
        velocity_max : 0.85,
        rates        : new A,
        slots        : A.of(
            { id: 'power1',  family: 'power',  size: 'light' },
            { id: 'cruise1', family: 'cruise', size: 'light' },
            { id: 'cargo1',  family: 'cargo',  size: 'light' }),
    }),
}, null))

/**
 * the starter ship's day-1 rig. every module here
 * is a net-zero placeholder, so hull base alone
 * already equals today's 20 cap / 0.6
 * see the 'starter rig resolves to today's stats' test.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const starterRig = O.freeze({
    power1 : 'reactor.mk1',
    cruise1: 'cruise.mk1',
    cargo1 : 'cargo.mk1',
})

/*
    the real, live catalogue - every service imports these 3, bound to
    the module-level `modules` above
*/
export const fitting     = new Fitting
export const deriveStats = fitting.deriveStats.bind(fitting)
export const previewRig  = fitting.previewRig.bind(fitting)

// ── functions ──────────────────────────────────────────────────

/**
 * @param {Weight} size
 * @return {number}
 */
function mountIndex(size) {
    const i = mounts.indexOf(size)
    i === -1 && Fail.raise(`unknown mount size: ${ size }`)
    return i
}

/**
 * @param {number} base
 * @param {number} max
 * @param {Design[]} designs
 * @param {'capacity'|'velocity'|'power'} stat
 * @return {number}
 */
function resolve(base, max, designs, stat) {
    let flat = 0, pct = 0
    for (const { effects } of designs) {
        for (const e of effects) {
            if (e.stat === stat) {
                e.kind === 'flat'
                    ? flat += e.value
                    : pct += e.value
            }
        }
    }
    return Math.min(max, (base + flat) * (1 + pct))
}

/**
 * @param {Record<string, string>} fitted
 * @param {Operation} operation
 * @return {Record<string, string>}
 */
function applyOperation(fitted, { type, slot, gid }) {
    const proposed = { ...fitted }
    if (type === 'install')
        proposed[ slot ] = gid
    else
        delete proposed[ slot ]
    return proposed
}

/**
 * @param {RigContext} rig
 * @param {Context} ctx
 * @return {boolean}
 */
function legalContext(rig, ctx) {
    if (ctx === 'field')    return true
    if (ctx === 'port')     return !!rig.docked
    if (ctx === 'dockyard') return !!rig.dockyard
    return false
}

/**
 * @param {Map<string, number>} ranks
 * @param {Rate} req
 * @return {boolean}
 */
function conflicting(ranks, { rate, rank }) {
    return rank == null
        ? ranks.has(rate)
        : (ranks.get(rate) ?? 0) >= rank
}

/**
 * @param {{ gid: string, quantity: number }[]} cargo
 * @param {Record<string, { volume: number }>} goods
 * @return {number}
 */
export function cargoLoad(cargo, goods) {
    return cargo.reduce((n, c) => n
        + c.quantity
        * (goods[ c.gid ]?.volume ?? 1), 0)
}

// ── types ────────────────────────────────────────────────────

/**
 *
 * @typedef { import('../types/modules.d.ts').Weight     } Weight
 * @typedef { import('../types/modules.d.ts').Context    } Context
 * @typedef { import('../types/modules.d.ts').Slot       } Slot
 * @typedef { import('../types/modules.d.ts').Rate       } Rate
 * @typedef { import('../types/modules.d.ts').Effect     } Effect
 * @typedef { import('../types/modules.d.ts').Stats      } Stats
 * @typedef { import('../types/modules.d.ts').Operation  } Operation
 * @typedef { import('../types/modules.d.ts').RigContext } RigContext
 * @typedef { import('../types/modules.d.ts').RigPreview } RigPreview
 */
