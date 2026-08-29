import { O, Is, Fail, each, nil } from '@theseus/util'

/*
    ship modules - pure catalogue + resolver, no io.
    mechanics are designed in docs/modules.md - read that first.

    a module design (this file) is not a good (universe.js's `goods`).
    the design holds family/mount/power/requirements/effects; the good
    holds name/price/kind/volume. they join on a shared gid. this file
    imports nothing from universe.js, so universe.js can freely import
    catalogues from here with no import cycle.
*/

// mount sizes, smallest to largest - a slot accepts its own size and
// anything smaller
export const mounts = O.freeze([ 'light', 'medium', 'heavy' ])

// the 8 slot families from docs/modules.md - client ordering
export const slotFamilies = O.freeze([
    'power', 'cruise',
    'maneuver', 'cargo',
    'utility', 'hardpoint',
    'external', 'cosmetic',
])

function mountIndex(size) {
    const i = mounts.indexOf(size)
    i === -1 && Fail.raise(`unknown mount size: ${ size }`)
    return i
}

// ── hulls ────────────────────────────────────────────────────

export const hulls = freeze({
    starter: {
        id           : 'starter',
        power_base   : 3,
        capacity_base: 20,
        velocity_base: 0.6,
        velocity_max : 0.85,
        capabilities : [],
        slots: [
            { id: 'power1',  family: 'power',  size: 'light' },
            { id: 'cruise1', family: 'cruise', size: 'light' },
            { id: 'cargo1',  family: 'cargo',  size: 'light' },
        ],
    },
})

// the starter ship's day-1 loadout. every module here is a net-zero
// placeholder, so hull base alone already equals today's 20 cap / 0.6c -
// see the 'starter loadout resolves to today's stats' test.
export const starterLoadout = freeze({
    power1 : 'reactor.mk1',
    cruise1: 'cruise.mk1',
    cargo1 : 'cargo.mk1',
})

// ── module designs ───────────────────────────────────────────
// requires/conflicts: [{ capability, rank }]. provides: same shape.
// effects: [{ stat, kind: 'flat' | 'percent', value }].

function design(mod) {
    mod.family
    mod.mount
    mod.power
    mod.installContext ??= 'port'
    mod.requires ??= []
    mod.conflicts ??= []
    mod.provides ??= []
    mod.effects ??= []
    return freeze(mod)
}

export const modules = freeze({
    'reactor.mk1': design({ family: 'power', mount: 'light', power: 1, provides: [{ capability: 'power', rank: 1 }], effects: [{ stat: 'power', kind: 'flat', value: 5 }]}),
    'reactor.mk2': design({ family: 'power', mount: 'light', power: 2, provides: [{ capability: 'power', rank: 2 }], effects: [{ stat: 'power', kind: 'flat', value: 9 }]}),

    'cruise.mk1': design({ family: 'cruise', mount: 'light', power: 1 }),
    // needs reactor.mk2's power rank - a real dependency, not history
    'cruise.mk2': design({ family: 'cruise', mount: 'light', power: 2, requires: [{ capability: 'power', rank: 2 }], effects: [{ stat: 'velocity', kind: 'percent', value: 0.08 }]}),

    'cargo.mk1': design({ family: 'cargo', mount: 'light', power: 0 }),
    'cargo.mk2': design({ family: 'cargo', mount: 'light', power: 1, effects: [{ stat: 'capacity', kind: 'flat', value: 10 }]}),
})

// ── resolver ─────────────────────────────────────────────────

/**
 * bound to one module catalogue - `fitting` below is the real, live
 * one. tests construct their own instance with a toy catalogue.
 */
export class Fitting {
    #catalog

    constructor(catalog = modules) {
        this.#catalog = catalog
    }

    /**
     * hull base -> flat additions -> percent modifiers -> hull maximum.
     * order-independent: every fold below is a sum or a max.
     */
    deriveStats(hull, fitted) {
        const designs = Object.values(fitted).map(gid => this.#catalog[ gid ]).filter(Boolean)

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
     * preview one install or remove against a hull + its current fitted
     * modules. requirements inspect the proposed final loadout only,
     * never history. returns every violation, not just the first.
     *
     * @param  { object } hull
     * @param  { Record<string, string> } fitted - slot id -> gid
     * @param  { { type: 'install' | 'remove', slot: string, gid?: string } } operation
     * @param  { { docked?: boolean, dockyard?: boolean } } [context]
     */
    previewLoadout(hull, fitted, operation, context = {}) {
        operation.type === 'install' || operation.type === 'remove'
            || Fail.raise(`unknown operation type: ${ operation.type }`)

        const proposed = applyOperation(fitted, operation)
        const errors   = [
            ...this.#operationErrors(hull, fitted, operation, context),
            ...this.#requirementErrors(hull, proposed),
        ]

        const stats = this.deriveStats(hull, proposed)
        stats.power.used <= stats.power.available
            || errors.push(`power draw ${ stats.power.used } exceeds ${ stats.power.available } available`)

        return { proposed, stats, errors }
    }

    #operationErrors(hull, fitted, operation, context) {
        return operation.type === 'install'
            ? this.#installErrors(hull, operation, context)
            : this.#removeErrors(fitted, operation, context)
    }

    #installErrors(hull, { slot: slotId, gid }, context) {
        const slot   = hull.slots.find(s => s.id === slotId)
        const design = this.#catalog[ gid ]
        const errors = []

        if (!slot)   errors.push(`unknown slot: ${ slotId }`)
        if (!design) errors.push(`unknown module: ${ gid }`)
        if (!slot || !design) return errors

        slot.family === design.family
            || errors.push(`${ gid } does not fit the ${ slot.family } slot`)
        mountIndex(design.mount) <= mountIndex(slot.size)
            || errors.push(`${ gid } is too large for slot ${ slot.id }`)
        legalContext(context, design.installContext)
            || errors.push(`${ gid } requires ${ design.installContext }`)
        return errors
    }

    #removeErrors(fitted, { slot: slotId }, context) {
        const outgoing = this.#catalog[ fitted[ slotId ] ]
        if (!outgoing) return [ `nothing fitted at slot ${ slotId }` ]

        return legalContext(context, outgoing.installContext)
            ? []
            : [ `removing ${ fitted[ slotId ] } requires ${ outgoing.installContext }` ]
    }

    #requirementErrors(hull, proposed) {
        const ranks  = this.#capabilityRanks(hull, proposed)
        const errors = []

        for (const gid of Object.values(proposed)) {
            const d = this.#catalog[ gid ]
            if (!d) continue

            for (const req of d.requires) {
                (ranks.get(req.capability) ?? 0) >= req.rank
                    || errors.push(`${ gid } needs ${ req.capability } ${ req.rank }`)
            }

            for (const c of d.conflicts)
                !conflicting(ranks, c) || errors.push(`${ gid } conflicts with ${ c.capability }`)
        }
        return errors
    }

    #capabilityRanks(hull, proposed) {
        const ranks = new Map(hull.capabilities.map(c => [ c.capability, c.rank ]))

        for (const gid of Object.values(proposed)) {
            const d = this.#catalog[ gid ]
            if (!d) continue
            for (const { capability, rank } of d.provides)
                (ranks.get(capability) ?? 0) >= rank || ranks.set(capability, rank)
        }
        return ranks
    }
}

function resolve(base, max, designs, stat) {
    let flat = 0, pct = 0
    for (const d of designs) {
        for (const e of d.effects) {
            if (e.stat === stat)
                e.kind === 'flat' ? flat += e.value : pct += e.value
        }
    }

    return Math.min(max, (base + flat) * (1 + pct))
}

function applyOperation(fitted, { type, slot, gid }) {
    const proposed = { ...fitted }
    type === 'install' ? proposed[ slot ] = gid : delete proposed[ slot ]
    return proposed
}

function legalContext(ctx, installContext) {
    if (installContext === 'field')    return true
    if (installContext === 'port')     return !!ctx.docked
    if (installContext === 'dockyard') return !!ctx.dockyard
    return false
}

function conflicting(ranks, { capability, rank }) {
    return rank == null ? ranks.has(capability) : (ranks.get(capability) ?? 0) >= rank
}

// the real, live catalogue - every service imports these 2, bound to
// the module-level `modules` above
export const fitting        = new Fitting
export const deriveStats    = fitting.deriveStats.bind(fitting)
export const previewLoadout = fitting.previewLoadout.bind(fitting)

export function cargoLoad(cargo, goodsCatalog) {
    return cargo.reduce((n, c) => n + c.quantity * (goodsCatalog[ c.gid ]?.volume ?? 1), 0)
}

export function freeze(x) {
    if (Is.x(x)) {
        each(x, nil)
        if (Is.a(x))
            x.forEach(nil)
        else
            each(O.setPrototypeOf(x, null), nil)
        return O.freeze(x)
    }
}
