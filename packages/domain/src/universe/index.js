// @ts-check

import { readEnv } from '@theseus/config'
import { O, Fail, each, nil } from '@theseus/util'

import randomShipName from '../shipNames.js'
import { hulls, modules } from './modules.js'

import { Universe } from './graph.js'
import { Good, System } from './model.js'
import { goods as commodities } from './goods.js'
import { systems as rawSystems, stars } from './systems.js'
import { lightYears, YEAR, LIGHT, SUBLIGHT } from './space.js'

/*
    the composer. it builds the universe in 2 passes, because a
    constructor sees one row and cannot check a cross reference.

        1. construct every Good - the registry
        2. construct every System, and every Station under it
        3. resolve - every produces, consumes and stocks gid
           must name something that exists
        4. derive each in-system link from the gap between 2 radii

    pass 3 is pure. no pool, no env, no disk. so it runs in the fast ci
    job, and a typo fails the pull request before the integration job
    starts.
*/

// ── the seed ─────────────────────────────────────────────────

const TRADE  = [ 'name', 'price_base', 'elasticity', 'kind', 'volume' ]
const DESIGN = [ 'family', 'mount', 'power', 'context', 'requires', 'conflicts', 'provides', 'effects' ]

/**
 * one table of everything a station can sell. a commodity is a Good,
 * and a module is a Design, which extends Good. so `kind` tells them
 * apart and both answer the same trade questions.
 *
 * @type { Readonly<Record<string, Good | Design>> }
 */
export const catalogue = O.ƒ({ ...build(commodities, Good), ...modules })

/** sysid → system, every station under it built and sorted */
const systems = build(rawSystems, System)

resolve(systems, catalogue, modules)

/** the live graph. one per process, and the whole game routes on it */
const universe = populate(new Universe, systems)

export default universe

// ── the starter ship ─────────────────────────────────────────

/**
 * every player starts here, in a ship of this shape.
 *
 * @type { Readonly<Ship> }
 */
export const starterShip = nil({
    get name() { return randomShipName() },
    stid        : 'sol.outpost',
    velocity    : 0.6,
    acceleration: 0.002,
    capacity    : 20,
})

// ── game mechanics ───────────────────────────────────────────

/** the credit sign the client prints */
export const currency = '₢'

/** seconds of real time for one game year. the tempo of the whole game */
export const TIME_SCALE = readEnv('TIME_SCALE', 20)

/** a multiple of light speed. a message beats a ship, it does not beat physics */
export const ANSIBLE_SPEED = readEnv('ANSIBLE_SPEED', 100)

/** per common year. what a voyage costs in held capital */
export const INTEREST_RATE = readEnv('INTEREST_RATE', 0.05)

/** what a new player's wallet holds */
export const STARTER_CREDITS = readEnv('STARTER_CREDITS', 1000)

/**
 * the wire keeps 2 views of one catalogue: `goods` carries what a
 * station sells, `modules` what a slot does with it. a Design holds
 * both halves, so each view is a projection and never a second table.
 *
 * @type { Readonly<Record<string, TradeView>> }
 */
export const goods = project(catalogue, TRADE)

/**
 * the whole map and catalogue, as the client reads it.
 *
 * @type { JUniverseData }
 */
export const universeData = nil({
    ...universe.toJSON(),
    goods,
    hulls,
    modules: project(modules, DESIGN),
    starter: starterShip,
    constants: {
        time_scale     : TIME_SCALE,
        ansible_speed  : ANSIBLE_SPEED,
        interest_rate  : INTEREST_RATE,
        starter_credits: STARTER_CREDITS,
        // the client repeats legTime() for its eta preview.
        // these 2 convert light years to metres, and seconds to years.
        light_speed    : LIGHT,
        year_seconds   : YEAR,
        currency,
    },
})

// ── the passes ───────────────────────────────────────────────

/**
 * one view of a catalogue - the named fields of every row, and no other.
 *
 * the kept fields come from `fields`, so the shape is a runtime
 * choice. the caller names the view it asked for.
 *
 * @param  { Record<string, any> } table  - key → built object
 * @param  { string[] } fields - what the view keeps
 * @return { Record<string, any> } key → view
 */
function project(table, fields) {
    /** @type { Record<string, any> } */
    const out = O.o
    each(table, (k, v) => out[ k ] = nil(O.from(fields.map(f => [ f, v[ f ] ]))))
    return O.ƒ(out)
}

/**
 * one raw table in, one table of built objects out.
 *
 * @template T
 * @param  { Record<string, any> } raw - key → seed
 * @param  { new (k: string, v: any) => T } ctor - takes (key, seed)
 * @return { Record<string, T> }
 */
function build(raw, ctor) {
    /** @type { Record<string, T> } */
    const out = O.o
    return each(raw, (k, v) => out[ k ] = new ctor(k, v), out)
}

/**
 * every gid a station names must exist, or the map is a lie.
 *
 * @param { Record<string, System> } list     - sysid → system
 * @param { object } catalog                  - gid → good
 * @param { object } fittings                 - gid → design
 * @throws when a station names a good or a module that no one built
 */
function resolve(list, catalog, fittings) {
    each(list, (sysid, sys) => sys.stations.forEach(st => {
        for (const field of [ 'produces', 'consumes' ]) {
            O.keys(st[ field ]).forEach(gid => catalog[ gid ]
                || Fail.raise(`station ${ st.stid } ${ field } names an unknown good "${ gid }"`))
        }

        st.stocks.forEach(gid => {
            catalog[ gid ]  || Fail.raise(`station ${ st.stid } stocks an unknown good "${ gid }"`)
            fittings[ gid ] || Fail.raise(`station ${ st.stid } stocks "${ gid }", which is not a module`)
        })
    }))
}

/**
 * the graph reads the built systems. the distances come from the radii.
 *
 * @param { Universe } graph
 * @param { Record<string, System> } list - sysid → system
 * @return { Universe } the same graph, filled
 */
function populate(graph, list) {
    each(list, (sysid, sys) => {
        graph.system(sys.sysid, { name: sys.name, star: sys.star })
        sys.stations.forEach(st => graph.node(st.stid, station(sys, st)))

        // the distance is physics. the topology above it is a design choice
        for (const [ a, b ] of rawSystems[ sys.sysid ].links ?? [])
            graph.link(a, b, lightYears(Math.abs(orbit(sys, a) - orbit(sys, b))), SUBLIGHT)
    })

    stars.forEach(star => graph.link(...star))
    return graph
}

/**
 * what the graph stores for one station. the seed holds more.
 *
 * @param  { System  } sys
 * @param  { Station } st
 * @return { import('../../types/universe/graph.js').StationMeta }
 */
function station(sys, st) {
    return {
        system  : sys.sysid,
        name    : st.name,
        produces: st.produces,
        consumes: st.consumes,
        ...(st.stocks.length && { stocks: st.stocks }),
    }
}

/**
 * one station's orbit radius, in AU.
 *
 * @param  { System } sys
 * @param  { string } stid
 * @return { number } astronomical units
 * @throws when the system links a station it does not hold
 */
function orbit(sys, stid) {
    const st = sys.stations.find(x => x.stid === stid)
    return st?.au ?? Fail.raise(`system ${ sys.sysid } links ${ stid }, which it does not hold`)
}

/**
 * @typedef { import('./model.js').Station } Station
 * @typedef { import('./modules.js').Design } Design
 * @typedef { import('../../types/universe/index.js').Ship      } Ship
 * @typedef { import('../../types/universe/index.js').TradeView } TradeView
 * @typedef { import('../../types/universe/graph.js').UniverseJSON } JUniverse
 * @typedef { JUniverse & {
 *   goods: Readonly<Record<string, TradeView>>,
 *   hulls: typeof hulls,
 *   modules: Readonly<Record<string, object>>,
 *   starter: Ship,
 *   constants: import('../../types/universe/index.js').Constants,
 * }} JUniverseData
 */
