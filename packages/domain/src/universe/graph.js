// @ts-check

import { O, Is, Fail } from '@theseus/util'

import { legTime } from './space.js'

/*
    the graph and the routing. it holds systems, stations and edges,
    and it answers path() and distance(). it knows no orbit radius and
    no good - the data arrives through system(), node() and link().
*/

export class Universe {

    /** @type { Map<string, SystemNode> }        */ systems = new Map // sysid → { sysid, name, star }
    /** @type { Map<string, StationNode> }       */ nodes   = new Map // stid → { stid, system, name, produces, consumes }
    /** @type { Map<string, Map<string, Edge>> } */ edges   = new Map // stid → Map(stid → { ly, c }), each station's neighbors, in both directions
    /**
     * @param  { string } sysid
     * @param  { SystemMeta } [meta]
     * @return { SystemNode }
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
     * @param {StationMeta} meta
     * @return {StationNode}
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
     * the shortest physical route between 2 stations, in light
     * years. an ansible signal is not a ship. it takes no
     * speed-limit discount near a star. this method weighs each
     * edge by its own `ly` value alone, not by `path()`'s
     * travel-time weight.
     *
     * @param {string} from
     * @param {string} to
     * @return {number} light years
     */
    distanceTo(from, to) {
        this.has(from) || Fail.raise(`unknown station: ${ from }`)
        this.has(to)   || Fail.raise(`unknown station: ${ to }`)

        if (from === to) return 0

        const dist = this.#shortestDistance(from)
        return dist.has(to)
            ? dist.get(to)
            : Fail.raise(`unknown route: ${ from } → ${ to }`)
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
     * an edge weighs `legTime()`, in years. a fast route does not
     * help a slow ship. every stop costs a weak drive more time.
     * so the best path changes with the ship, and `path()` needs
     * both numbers.
     *
     * returns the stids from `from` to `to`, in order, both included.
     * returns undefined when no route connects them.
     *
     * @param {string} from
     * @param {string} to
     * @param {number} velocity
     * @param {number} acceleration
     * @return {string[] | undefined}
     */
    path(from, to, velocity, acceleration) {
        this.has(from) || Fail.raise(`unknown station: ${ from }`)
        this.has(to)   || Fail.raise(`unknown station: ${ to }`)

        Is.n(velocity)     && velocity     > 0 || Fail.raise('velocity must be a positive number')
        Is.n(acceleration) && acceleration > 0 || Fail.raise('acceleration must be a positive number')

        if (from === to) return [ from ]

        const prev = this.#shortestTime(from, velocity, acceleration)

        if (!prev.has(to)) return

        // walk prev backward from `to`. this builds the route forward.

        let at = to, route = [ to ]
        while (at !== from)
            route.unshift(at = prev.get(at))
        return route

        // return prev.has(to)
        //     ? trace(prev, from, to)
        //     : void 0
    }

    /**
     * plain json shape, for wire transfer. link() stores both
     * directions of a route, so 3 links become 6 directed routes. a
     * consumer can filter "departures from here" in one line. it does
     * not need to know edges is a Map.
     *
     * @return {JUniverse}
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
     * @param {number} acceleration
     * @return {Map<string, string>}
     */
    #shortestTime(from, velocity, acceleration) {
        const prev  = new Map
        const dist  = new Map([[ from, 0 ]])
        const queue = new Set([ from ])

        while (queue.size) {
            const at = closest(queue, dist)
            queue.delete(at)

            for (const [ next, edge ] of this.neighbors(at)) {
                const cost = dist.get(at) + legTime(edge.ly, edge.c, velocity, acceleration)
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
     * the distance-only twin of `#shortestTime`. it uses the same
     * dijkstra shape, but weighs each edge by `edge.ly` alone. it
     * takes no velocity.
     *
     * @param {string} from
     * @return {Map<string, number>} stid -> total light years from `from`
     */
    #shortestDistance(from) {
        const dist  = new Map([[ from, 0 ]])
        const queue = new Set([ from ])

        while (queue.size) {
            const at = closest(queue, dist)
            queue.delete(at)

            for (const [ next, edge ] of this.neighbors(at)) {
                const cost = dist.get(at) + edge.ly
                if (cost < (dist.get(next) ?? Infinity)) {
                    dist.set(next, cost)
                    queue.add(next)
                }
            }
        }
        return dist
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

/**
 * @typedef { import('../../types/universe/graph.js').Edge         } Edge
 * @typedef { import('../../types/universe/graph.js').Route        } Route
 * @typedef { import('../../types/universe/graph.js').SystemNode   } SystemNode
 * @typedef { import('../../types/universe/graph.js').SystemMeta   } SystemMeta
 * @typedef { import('../../types/universe/graph.js').StationNode  } StationNode
 * @typedef { import('../../types/universe/graph.js').StationMeta  } StationMeta
 * @typedef { import('../../types/universe/graph.js').UniverseJSON } JUniverse
 */
