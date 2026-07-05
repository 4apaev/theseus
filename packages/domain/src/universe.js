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

/*
    TODO
        consume/produce
            station can consume/produce more then one good,
            not only goods, but also services
            like repair, security/policing, tech, work force etc...
            needs more thinking.

        station types
            trade posts
            research labs/outposts
            military bases
            population centers
            etc...

*/

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
