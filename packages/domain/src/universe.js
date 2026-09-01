// @ts-check

import { readEnv } from '@theseus/config'
import { O, Is, Fail, nil } from '@theseus/util'

import randomShipName from './shipNames.js'
import { hulls, modules } from './modules.js'

export class Universe {

    /** @type { Map<string, System> }            */ systems = new Map // sysid → { sysid, name, star }
    /** @type { Map<string, Station> }           */ nodes   = new Map // stid → { stid, system, name, produces, consumes }
    /** @type { Map<string, Map<string, Edge>> } */ edges   = new Map // stid → Map(stid → { ly, c }), each station's neighbors, in both directions
    /**
     * @param  { string } sysid
     * @param  { Omit<System, 'sysid'> } [meta]
     * @return { System }
     */
    system(sysid, meta) {
        return this.systems.getOrInsertComputed(sysid, () => O.ƒ({ sysid, ...meta }))
    }

    /**
     * every station belongs to a system.
     * the client map groups stations by system.
     * a station with no system does not show on the map.
     *
     * @param {string} stid
     * @param {SMeta} meta
     * @return {Station}
     */
    node(stid, meta) {
        this.systems.has(meta?.system) || Fail.raise(`unknown system: ${ meta?.system }`)
        return this.nodes.getOrInsertComputed(stid, () => O.ƒ({ stid, ...meta }))
    }

    /**
     *  c sets the route speed limit, as a fraction of light speed.
     *  a value of 1 lets the ship fly at its own velocity.
     *  an in-system route sets a low value - see SUBLIGHT below.
     *
     * @param {string} a  - a station id
     * @param {string} b  - the other station id
     * @param {number} ly - light years
     * @param {number} c  - speed limit, as a fraction of light speed
     * @return {Universe}
     */
    link(a, b, ly, c = 1) {
        this.has(a) || Fail.raise(`unknown station: ${ a }`)
        this.has(b) || Fail.raise(`unknown station: ${ b }`)

        /** @type {Edge} */
        const edge = O.ƒ({ ly, c })
        this.#edge(a).set(b, edge)
        this.#edge(b).set(a, edge)
        return this
    }

    /**
     * @param {string} stid
     * @return {boolean}
     */
    has(stid) {
        return this.nodes.has(stid)
    }

    /**
     * @param {string} stid
     * @return {Map<string, Edge>}
     */
    neighbors(stid) {
        this.has(stid) || Fail.raise(`unknown station: ${ stid }`)
        return this.#edge(stid)
    }

    /**
     * @param {string} from
     * @param {string} to
     * @return {Edge}
     */
    route(from, to) {
        return this.neighbors(from).get(to)
            ?? Fail.raise(`unknown route: ${ from } → ${ to }`)
    }

    /**
     * @param {string} from
     * @param {string} to
     * @return {number} light years
     */
    distance(from, to) {
        return this.route(from, to).ly
    }

    /**
     * @param {string} from
     * @param {string} to
     * @return {number} speed limit, in fractions of light speed
     */
    speedLimit(from, to) {
        return this.route(from, to).c
    }

    /**
     * dijkstra. the weight of one edge is travel time, not light years.
     *
     * a short in-system hop still costs a slow ship a lot of time.
     * the route's own speed limit holds a slow ship back.
     * a hop between stars is long in light years, but the ship
     * flies it at its own speed. a search by distance alone would
     * send a player through the whole Sol system for no gain - see progress.md.
     *
     * edge weight = ly / min(velocity, c), in years. a slow ship gets
     * no benefit from a fast route. so the best path can change with
     * the ship. this is why `path()` needs the velocity.
     *
     * returns the stids from `from` to `to`, in order, both included.
     * returns undefined when no route connects them.
     *
     * @param {string} from
     * @param {string} to
     * @param {number} velocity
     * @return {string[] | undefined}
     */
    path(from, to, velocity) {
        this.has(from) || Fail.raise(`unknown station: ${ from }`)
        this.has(to)   || Fail.raise(`unknown station: ${ to }`)
        Is.n(velocity) && velocity > 0 || Fail.raise('velocity must be a positive number')

        if (from === to) return [ from ]

        const prev = this.#shortestTime(from, velocity)
        return prev.has(to)
            ? trace(prev, from, to)
            : void 0
    }

    /**
     * plain json shape, for wire transfer. link() stores both
     * directions of a route, so 3 links become 6 directed routes. a
     * consumer can filter "departures from here" in one line. it does
     * not need to know edges is a Map.
     */
    toJSON() {
        return {
            systems : [ ...this.systems.values() ],
            stations: [ ...this.nodes.values() ],
            routes  : [ ...this.edges ].flatMap(([ from, m ]) =>
                [ ...m ].map(([ to, { ly, c }]) => ({ from, to, ly, c }))),
        }
    }

    /**
     * the shortest-time tree from `station:from`.
     * a stid → previous-stid map.
     * finds the closest unvisited station with a plain linear scan.
     * the universe holds a few dozen stations - it needs no heap.
     *
     * @param {string} from
     * @param {number} velocity
     * @return {Map<string, string>}
     */
    #shortestTime(from, velocity) {
        const prev  = new Map
        const dist  = new Map([[ from, 0 ]])
        const queue = new Set([ from ])

        while (queue.size) {
            const at = closest(queue, dist)
            queue.delete(at)

            for (const [ next, edge ] of this.neighbors(at)) {
                const cost = dist.get(at) + edge.ly / Math.min(velocity, edge.c)
                if (cost < (dist.get(next) ?? Infinity)) {
                    dist.set(next, cost)
                    prev.set(next, at)
                    queue.add(next)
                }
            }
        }
        return prev
    }

    /**
     * @param {string} stid
     * @return {Map<string, Edge>}
     */
    #edge(stid) {
        return this.edges.getOrInsertComputed(stid, () => new Map)
    }
}

/**
 * the station in queue with the lowest dist. queue holds only
 * stations that dist already has an entry for.
 *
 * @param {Set<string>} queue
 * @param {Map<string, number>} dist
 */
function closest(queue, dist) {
    return [ ...queue ].reduce((a, b) => dist.get(a) < dist.get(b) ? a : b)
}

/**
 * walk prev backward from `to`. this builds the route forward.
 *
 * @param {Map<string, string>} prev
 * @param {string} from
 * @param {string} to
 * @return {string[]}
 */
function trace(prev, from, to) {
    let at = to, route = [ to ]
    while (at !== from)
        route.unshift(at = prev.get(at))
    return route
}

//  ── the known universe ───────────────────────────────────────
/*
    a system holds stations.
    gateway - main station in a system, links to the other stars.
    the rest are planets and moons linked only inside their own system.

    star distances are real, in light years, from sol.outpost
    the source is the HYG star catalogue (docs/hygdata_v42.csv).

    an in-system distance is the gap between two mean orbit radii,
    in astronomical units.

    the radii are the standard NASA figures. this is an approximation,
    the true distance moves with the planets.

    sol outpost has no orbit of its own.
    it sits at Earth's, 1.0 AU out - home base
*/

const AU       = 1 / 63241.077  // one astronomical unit, in light years
const SUBLIGHT = 0.00008        // 24 km/s

/*
    the speed limit of an in-system route.
    0.00008c is 24 km/s - 1.5 times voyager 2's speed.

    the limit stops a short hop from ending before it starts.
    venus sits 0.000013 ly from mars.
    at 0.6c that trip takes 0.0004 game seconds.
    at 24 km/s it takes 3 seconds.
    mars to titan, the longest hop in sol, takes 32 seconds,
    still far under a trip between stars.
*/
const universe = new Universe
export default universe

/**
 * @param  { number  } n
 * @return { number }
 */
function au(n) {
    return n * AU
}

universe.system('sol',            { name: 'Sol',            star: 'G2V yellow dwarf' })
universe.system('alpha.centauri', { name: 'Alpha Centauri', star: 'G2V + K1V binary' })
universe.system('barnards.star',  { name: 'Barnards Star',  star: 'M4V red dwarf' })
universe.system('wolf.359',       { name: 'Wolf 359',       star: 'M6V red dwarf' })
universe.system('sirius',         { name: 'Sirius',         star: 'A1V + white dwarf' })

/*
    Sol is the built-out system. the stations are declared in orbit order.
    the client map draws each cluster in that same order,
    so Mercury sits next to the star.
    the outpost sits between Venus and Mars, close to home.
    Sol Outpost is the gateway - it holds the links to the other stars.
*/
universe.node('sol.mercury',    { system: 'sol', name: 'Mercury Deep',   produces: { ore  : 10 }, consumes: { grain: 6 }})
universe.node('sol.venus',      { system: 'sol', name: 'Venus Lab',      produces: { spice:  6 }, consumes: { ore  : 4 }})
universe.node('sol.outpost',    { system: 'sol', name: 'Sol Outpost',    produces: { ore  :  8 }, consumes: { grain: 5 }, stocks: [ 'reactor.mk1', 'cruise.mk1', 'cargo.mk1' ]})
universe.node('sol.mars',       { system: 'sol', name: 'Mars Hub',       produces: { grain:  7 }, consumes: { spice: 5 }})
universe.node('sol.ganymede',   { system: 'sol', name: 'Ganymede Yards', produces: { ore  :  6 }, consumes: { spice: 4 }, stocks: [ 'reactor.mk2', 'cruise.mk2', 'cargo.mk2' ]})
universe.node('sol.titan',      { system: 'sol', name: 'Titan Ring',     produces: { spice:  7 }, consumes: { grain: 5 }})

universe.node('alpha.exchange', { system: 'alpha.centauri', name: 'Alpha Exchange', produces: { grain: 8 }, consumes: { spice: 5 }})
universe.node('barnards.port',  { system: 'barnards.star',  name: 'Barnards Port',  produces: { spice: 8 }, consumes: { ore  : 5 }})
universe.node('wolf.reach',     { system: 'wolf.359',       name: 'Wolf Reach',     produces: { grain: 9 }, consumes: { ore  : 6 }})
universe.node('sirius.gate',    { system: 'sirius',         name: 'Sirius Gate',    produces: { ore  : 9 }, consumes: { spice: 6 }})

/*  ── sol system ───────────────────────────────────────────────
    in-system routes, in AU. a route's length is the gap between the
    two orbit radii above. every station sits on one line, at its own
    distance from Sol, in this order: Mercury, Venus, Outpost, Mars,
    Ganymede, Titan.

    on a line, a direct link is not a shortcut when a 3rd station sits
    between the two ends. it costs the same as the long way round.
    Titan↔Outpost (8.537 AU) equals Titan→Mars→Outpost added up, since
    Mars sits between them. the same holds for Mars↔Titan (8.013 AU)
    against Mars→Ganymede→Titan. `path()` finds no real shortcut on
    either pair.

    Outpost↔Mercury is different. Outpost sits between Venus and Mars,
    not beyond either one. so the direct link (0.613 AU) is truly
    shorter than the long way round, through Venus and Mars (1.661
    AU). this one is a real shortcut. `path()` finds it. */
universe
    .link('sol.outpost',  'sol.mercury',  au(0.613), SUBLIGHT)
    .link('sol.mercury',  'sol.venus',    au(0.336), SUBLIGHT)
    .link('sol.venus',    'sol.mars',     au(0.801), SUBLIGHT)
    .link('sol.mars',     'sol.ganymede', au(3.679), SUBLIGHT)
    .link('sol.mars',     'sol.titan',    au(8.013), SUBLIGHT)
    .link('sol.mars',     'sol.outpost',  au(0.524), SUBLIGHT)
    .link('sol.titan',    'sol.outpost',  au(8.537), SUBLIGHT)
    .link('sol.ganymede', 'sol.titan',    au(4.334), SUBLIGHT)

/*  ── stars ────────────────────────────────────────────────────
    alpha.exchange stands for Rigil Kentaurus. it is the G2V star of
    the Alpha Centauri pair - the type closest to Sol's own.

    no gateway links to every other gateway. Sol does not reach Wolf
    359 or Sirius directly. a player flies through Alpha Centauri, or
    through Barnards Star. this is a design choice, not a fact about
    the stars: Sol is really 7.80 ly from Wolf 359, and 8.60 ly from
    Sirius, both in a straight line. */
universe
    .link('sol.outpost',    'alpha.exchange', 4.32)
    .link('sol.outpost',    'barnards.port',  5.95)
    .link('alpha.exchange', 'barnards.port',  6.44)
    .link('barnards.port',  'wolf.reach',     10.93)
    .link('alpha.exchange', 'sirius.gate',    9.52)
    .link('alpha.exchange', 'wolf.reach' ,    8.27)
    .link('wolf.reach',     'sirius.gate',    9.02)

// ── goods ────────────────────────────────────────────────────

export const goods = nil({
    ore  : { name: 'iron ore',    price_base: 40, elasticity: 1.2, kind: 'commodity', volume: 1 },
    grain: { name: 'hydro grain', price_base: 25, elasticity: 1.0, kind: 'commodity', volume: 1 },
    spice: { name: 'void spice',  price_base: 90, elasticity: 1.5, kind: 'commodity', volume: 1 },

    /*
        packaged modules - for family, mount, requirements.
        sparse by design: only a few stations stock these, see drift.js.
    */
    'reactor.mk1': { name: 'reactor mk1',      price_base: 200,  elasticity: 1.0, kind: 'module', volume: 4 },
    'reactor.mk2': { name: 'reactor mk2',      price_base: 900,  elasticity: 1.0, kind: 'module', volume: 4 },

    'cruise.mk1' : { name: 'cruise drive mk1', price_base: 150,  elasticity: 1.0, kind: 'module', volume: 6 },
    'cruise.mk2' : { name: 'cruise drive mk2', price_base: 1200, elasticity: 1.0, kind: 'module', volume: 6 },

    'cargo.mk1'  : { name: 'cargo module mk1', price_base: 100,  elasticity: 1.0, kind: 'module', volume: 8 },
    'cargo.mk2'  : { name: 'cargo module mk2', price_base: 500,  elasticity: 1.0, kind: 'module', volume: 8 },
})

// ── starter ship ─────────────────────────────────────────────

export const starterShip = nil({
    get name() { return randomShipName() },
    stid    : 'sol.outpost',
    velocity: 0.6,
    capacity: 20,
})

// ── game mechanics ───────────────────────────────────────────

export const currency = '₢'                                  // @ts-ignore
export const TIME_SCALE = readEnv('TIME_SCALE', 20)          // @ts-ignore
export const INTEREST_RATE = readEnv('INTEREST_RATE', 0.05)  // @ts-ignore
export const STARTER_CREDITS = readEnv('STARTER_CREDITS', 1000)
export const universeData = nil({
    ...universe.toJSON(),
    goods,
    hulls,
    modules,
    starter: starterShip,
    constants: {
        time_scale     : TIME_SCALE,
        interest_rate  : INTEREST_RATE,
        starter_credits: STARTER_CREDITS,
        currency,
    },
})

/**
 * @typedef { import('../types/universe.js').Edge         } Edge
 * @typedef { import('../types/universe.js').Route        } Route
 * @typedef { import('../types/universe.js').System       } System
 * @typedef { import('../types/universe.js').Station      } Station
 * @typedef { import('../types/universe.js').UniverseJSON } JUniverse
 * @typedef { import('../types/universe.js').StationMeta  } SMeta
 * @typedef { import('../types/universe.js').Ship         } Ship
 * @typedef { import('../types/universe.js').Good         } Good
 */
