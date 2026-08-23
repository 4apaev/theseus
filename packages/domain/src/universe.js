import { readEnv } from '@theseus/config'
import { O, Fail } from 'garage/util'

export class Universe {
    systems = new Map   // sysid → { sysid, name, star }
    nodes   = new Map   // stid → { stid, system, name, produces, consumes }
    edges   = new Map   // stid → Map(stid → { ly, c }), undirected adjacency

    system(sysid, meta) {
        return this.systems.getOrInsertComputed(sysid, () => O.ƒ({ sysid, ...meta }))
    }

    /*
        every station lives in a system. the client map groups by it, so a
        station without one cannot be drawn.
    */
    node(stid, meta) {
        this.systems.has(meta?.system) || Fail.raise(`unknown system: ${ meta?.system }`)
        return this.nodes.getOrInsertComputed(stid, () => O.ƒ({ stid, ...meta }))
    }

    /*
        c is the speed limit of the route, in fractions
        of light speed. 1 lets the ship use its own velocity.
        an in-system route sets a low value see SUBLIGHT
    */
    link(a, b, ly, c = 1) {
        this.has(a) || Fail.raise(`unknown station: ${ a }`)
        this.has(b) || Fail.raise(`unknown station: ${ b }`)

        const edge = O.ƒ({ ly, c })
        this.#edge(a).set(b, edge)
        this.#edge(b).set(a, edge)
        return this
    }

    has(stid) {
        return this.nodes.has(stid)
    }

    neighbors(stid) {
        this.has(stid) || Fail.raise(`unknown station: ${ stid }`)
        return this.#edge(stid)
    }

    route(from, to) {
        return this.neighbors(from).get(to)
            ?? Fail.raise(`unknown route: ${ from } → ${ to }`)
    }

    distance(from, to) {
        return this.route(from, to).ly
    }

    speedLimit(from, to) {
        return this.route(from, to).c
    }

    /*
        plain json shape for wire transfer - link() sets both directions,
        so 3 links become 6 directed routes, letting a consumer filter
        "departures from here" in one line without knowing edges is a Map
    */
    toJSON() {
        return {
            systems : [ ...this.systems.values() ],
            stations: [ ...this.nodes.values() ],
            routes  : [ ...this.edges ].flatMap(([ from, m ]) =>
                [ ...m ].map(([ to, { ly, c }]) => ({ from, to, ly, c }))),
        }
    }

    #edge(stid) {
        return this.edges.getOrInsertComputed(stid, () => new Map)
    }
}

/* ── the known universe ───────────────────────────────────────

    a system holds stations.
    one station in each system carries the links to other stars - the gateway.
    the other stations are planets and moons.
    they link only inside their own system.

    star distances are real, in light years, computed from Sol against
    the HYG star catalogue (docs/hygdata_v42.csv).

    an in-system distance is the gap between two mean orbit radii, in
    astronomical units. the radii are the standard published NASA
    figures. it is an approximation - the true distance changes as the
    planets move around the star.

    Sol Outpost has no orbit of its own - it sits at Earth's, 1.0 AU
    out. it is home base, where every new player starts, not a remote
    outpost. Ganymede and Titan are moons, so they sit at their
    planet's orbit: Jupiter's and Saturn's.

*/// one astronomical unit, in light years
const AU = 1 / 63241.077
const au = n => n * AU /*

    the speed limit of an in-system route.
    0.00008c is 24 km/s. this is 1.5 times the speed of Voyager 2.

    the limit keeps a short hop from ending before it starts. Venus is
    0.000013 ly from Mars. at 0.6c that trip takes 0.0004 game seconds.
    at 24 km/s the same trip takes 3 seconds. Mars to Titan, the
    longest hop in Sol, takes 32 seconds - still an order of magnitude
    under a trip between stars.  */
const SUBLIGHT = 0.00008 // 24 km/s

const universe = new Universe
export default universe

universe.system('sol',            { name: 'Sol',            star: 'G2V yellow dwarf' })
universe.system('alpha.centauri', { name: 'Alpha Centauri', star: 'G2V + K1V binary' })
universe.system('barnards.star',  { name: 'Barnards Star',  star: 'M4V red dwarf' })
universe.system('wolf.359',       { name: 'Wolf 359',       star: 'M6V red dwarf' })
universe.system('sirius',         { name: 'Sirius',         star: 'A1V + white dwarf' })

/*
    Sol is the built-out system. declare the stations in orbit
    order - the client map draws a cluster in that angular order,
    so Mercury sits next to the star and the outpost sits between
    Venus and Mars, close to home. Sol Outpost is the gateway.
    it keeps the links to the other stars.
*/
universe.node('sol.mercury',    { system: 'sol', name: 'Mercury Deep',   produces: { ore  : 10 }, consumes: { grain: 6 }})
universe.node('sol.venus',      { system: 'sol', name: 'Venus Lab',      produces: { spice:  6 }, consumes: { ore  : 4 }})
universe.node('sol.outpost',    { system: 'sol', name: 'Sol Outpost',    produces: { ore  :  8 }, consumes: { grain: 5 }})
universe.node('sol.mars',       { system: 'sol', name: 'Mars Hub',       produces: { grain:  7 }, consumes: { spice: 5 }})
universe.node('sol.ganymede',   { system: 'sol', name: 'Ganymede Yards', produces: { ore  :  6 }, consumes: { spice: 4 }})
universe.node('sol.titan',      { system: 'sol', name: 'Titan Ring',     produces: { spice:  7 }, consumes: { grain: 5 }})

// one station per system elsewhere. each one is its own gateway.
universe.node('alpha.exchange', { system: 'alpha.centauri', name: 'Alpha Exchange', produces: { grain: 8 }, consumes: { spice: 5 }})
universe.node('barnards.port',  { system: 'barnards.star',  name: 'Barnards Port',  produces: { spice: 8 }, consumes: { ore  : 5 }})
universe.node('wolf.reach',     { system: 'wolf.359',       name: 'Wolf Reach',     produces: { grain: 9 }, consumes: { ore  : 6 }})
universe.node('sirius.gate',    { system: 'sirius',         name: 'Sirius Gate',    produces: { ore  : 9 }, consumes: { spice: 6 }})

/*  ── sol system ───────────────────────────────────────────────
    in-system routes, in AU. the length of a route is the gap between
    the two orbit radii above - so every station sits on one line, at
    its own distance from Sol, in this order: Mercury, Venus, Outpost,
    Mars, Ganymede, Titan.

    on a line, a direct link between 2 stations with a 3rd one between
    them is never a shortcut: it costs exactly what the long way
    costs. Titan↔Outpost (8.537 AU) is the same distance as
    Titan→Mars→Outpost added up, since Mars sits between them. the
    same is true of Mars↔Titan (8.013 AU) against Mars→Ganymede→Titan.
    `path()` will find no real shortcut on either pair.

    Outpost↔Mercury is different: Outpost sits between Venus and Mars,
    not beyond either one, so the direct link (0.613 AU) is genuinely
    shorter than the long way round through Venus and Mars (1.661 AU).
    that one is a real shortcut, and `path()` will find it. */
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
    alpha.exchange stands for Rigil Kentaurus, the G2V star of the
    Alpha Centauri pair - the one closest to Sol's own type.

    no gateway links to every other gateway. Sol does not reach Wolf
    359 or Sirius directly. a player flies through Alpha Centauri, or
    through Barnards Star. that restriction is a design choice, not a
    fact about the stars - Sol really is 7.80 ly from Wolf 359 and
    8.60 ly from Sirius, both a straight line. */
universe
    .link('sol.outpost',    'alpha.exchange', 4.32)
    .link('sol.outpost',    'barnards.port',  5.95)
    .link('alpha.exchange', 'barnards.port',  6.44)
    .link('barnards.port',  'wolf.reach',     10.93)
    .link('alpha.exchange', 'sirius.gate',    9.52)
    .link('alpha.exchange', 'wolf.reach' ,    8.27)
    .link('wolf.reach',     'sirius.gate',    9.02)

// ── goods ────────────────────────────────────────────────────

export const goods = O.ƒ({
    ore  : O.ƒ({ name: 'iron ore',    price_base: 40, elasticity: 1.2 }),
    grain: O.ƒ({ name: 'hydro grain', price_base: 25, elasticity: 1.0 }),
    spice: O.ƒ({ name: 'void spice',  price_base: 90, elasticity: 1.5 }),
})

// ── starter ship ─────────────────────────────────────────────

export const starterShip = O.ƒ({
    name    : 'far treasure',
    stid    : 'sol.outpost',
    velocity: 0.6,
    capacity: 20,
})

// ── game mechanics ───────────────────────────────────────────
// the rules of this specific game - single source of truth,
// tunable via env (.env.dev shrinks TIME_SCALE for fast tests)

export const TIME_SCALE      = readEnv('TIME_SCALE', 20)
export const INTEREST_RATE   = readEnv('INTEREST_RATE', 0.05)
export const STARTER_CREDITS = readEnv('STARTER_CREDITS', 1000)

export const currency = '₢'
export const universeData = {
    ...universe.toJSON(),
    goods,
    starter: starterShip,
    constants: {
        time_scale     : TIME_SCALE,
        interest_rate  : INTEREST_RATE,
        starter_credits: STARTER_CREDITS,
        currency,
    },
}
