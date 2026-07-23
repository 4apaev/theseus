import { readEnv } from '@theseus/config'
import { O, Fail } from 'garage/util'

export class Universe {
    nodes = new Map   // stid → { stid, name, produces, consumes }
    edges = new Map   // stid → Map(stid → ly), undirected adjacency

    node(stid, meta) {
        return this.nodes.getOrInsertComputed(stid, () => O.ƒ({ stid, ...meta }))
    }

    link(a, b, ly) {
        this.has(a) || Fail.raise(`unknown station: ${ a }`)
        this.has(b) || Fail.raise(`unknown station: ${ b }`)
        this.#edge(a).set(b, ly)
        this.#edge(b).set(a, ly)
        return this
    }

    has(stid) {
        return this.nodes.has(stid)
    }

    neighbors(stid) {
        this.has(stid) || Fail.raise(`unknown station: ${ stid }`)
        return this.#edge(stid)
    }

    distance(from, to) {
        return this.neighbors(from).get(to)
            ?? Fail.raise(`unknown route: ${ from } → ${ to }`)
    }

    // plain json shape for wire transfer - link() sets both directions,
    // so 3 links become 6 directed routes, letting a consumer filter
    // "departures from here" in one line without knowing edges is a Map
    toJSON() {
        return {
            stations: [ ...this.nodes.values() ],
            routes  : [ ...this.edges ].flatMap(([ from, m ]) =>
                [ ...m ].map(([ to, ly ]) => ({ from, to, ly }))),
        }
    }

    #edge(stid) {
        return this.edges.getOrInsertComputed(stid, () => new Map)
    }
}

// ── the known universe ───────────────────────────────────────
// produce/consume triangle - every station exports one good
// cheap and craves another, so profitable routes exist in
// every direction

const universe = new Universe
export default universe

universe.node('sol.outpost',    { name: 'Sol Outpost',    produces: { ore: 8   }, consumes: { grain: 5 }})
universe.node('alpha.exchange', { name: 'Alpha Exchange', produces: { grain: 8 }, consumes: { spice: 5 }})
universe.node('barnards.port',  { name: 'Barnards Port',  produces: { spice: 8 }, consumes: { ore: 5   }})

universe
    .link('sol.outpost',    'alpha.exchange', 4.3)
    .link('sol.outpost',    'barnards.port',  6.0)
    .link('alpha.exchange', 'barnards.port',  5.9)

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
