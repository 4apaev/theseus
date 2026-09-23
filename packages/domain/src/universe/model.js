// @ts-check

import { O, Is, Fail, each } from '@theseus/util'

/*
    the seed classes. each one takes a raw object and checks it in the
    constructor, the way Hull and Design do in modules.js. the types
    then live here, so a consumer reads the same shape whatever the raw
    data came from - a literal, a json file, or a row from the admin
    board.

    a constructor sees one row, so it cannot catch a cross reference.
    `produces: { gráin: 7 }` builds a valid Station. resolve() in
    index.js catches that, once every Good exists.
*/

const positive = x => Is.n(x) && x > 0
const text     = x => Is.s(x) && x.length > 0

/** a tradable good. price_base and elasticity drive the price curve */
export class Good {
    /**
     * @param {string}   gid
     * @param {GoodSeed} raw
     */
    constructor(gid, raw) {
        text(gid)                || Fail.raise('a good needs a gid')
        text(raw?.name)          || Fail.raise(`good ${ gid } needs a name`)
        positive(raw.price_base) || Fail.raise(`good ${ gid } needs a positive price_base`)
        positive(raw.elasticity) || Fail.raise(`good ${ gid } needs a positive elasticity`)
        positive(raw.volume)     || Fail.raise(`good ${ gid } needs a positive volume`)
        text(raw.kind)           || Fail.raise(`good ${ gid } needs a kind`)

        this.gid        = gid
        this.name       = raw.name
        this.price_base = raw.price_base
        this.elasticity = raw.elasticity
        this.volume     = raw.volume
        this.kind       = raw.kind
    }
}

/*  a station sits at one orbit radius, in AU from its own star. the
    radius is the only position it carries - every in-system link comes
    from the gap between 2 radii.  */
export class Station {
    /**
     * @param {string}      stid
     * @param {StationSeed} raw
     */
    constructor(stid, raw) {
        text(stid)       || Fail.raise('a station needs a stid')
        text(raw?.name)  || Fail.raise(`station ${ stid } needs a name`)
        positive(raw.au) || Fail.raise(`station ${ stid } needs a positive orbit radius`)

        rates(stid, 'produces', raw.produces)
        rates(stid, 'consumes', raw.consumes)
        raw.stocks == null || Is.a(raw.stocks) || Fail.raise(`station ${ stid } stocks must be a list`)

        this.stid     = stid
        this.name     = raw.name
        this.au       = raw.au
        this.produces = raw.produces ?? {}
        this.consumes = raw.consumes ?? {}
        this.stocks   = raw.stocks ?? []
    }
}

/*  a system holds its stations in orbit order. the gateway carries the
    links to the other stars. an inner well is orbits with more than one
    entry - a bare gateway declares one, and that is the whole
    difference.  */
export class System {
    /**
     * @param {string}     sysid
     * @param {SystemSeed} raw
     */
    constructor(sysid, raw) {
        text(sysid)      || Fail.raise('a system needs a sysid')
        text(raw?.name)  || Fail.raise(`system ${ sysid } needs a name`)
        text(raw.star)   || Fail.raise(`system ${ sysid } needs a star`)
        Is.o(raw.orbits) || Fail.raise(`system ${ sysid } needs orbits`)

        this.sysid   = sysid
        this.name    = raw.name
        this.star    = raw.star
        this.gateway = raw.gateway

        /*  orbit order is declaration order, and the client map draws
            the cluster in it. sorting by radius keeps the 2 the same  */
        this.stations = O.entries(raw.orbits)
            .map(([ stid, seed ]) => new Station(stid, seed))
            .sort((a, b) => a.au - b.au)

        this.stations.length || Fail.raise(`system ${ sysid } needs at least one station`)
        this.stations.some(s => s.stid === this.gateway)
            || Fail.raise(`system ${ sysid } gateway ${ this.gateway } is not one of its stations`)
    }

    /** true when the system holds more than a gateway */
    get well() {
        return this.stations.length > 1
    }
}

/**
 * @param {string} stid
 * @param {string} field
 * @param {Record<string, number>} [map]
 */
function rates(stid, field, map) {
    if (map == null) return
    Is.o(map) || Fail.raise(`station ${ stid } ${ field } must be an object`)

    each(map, (k, v) =>
        positive(v)
        || Fail.raise(`station ${ stid } ${ field } ${ String(k) } must be positive`))

}

/**
 * @typedef { import('../../types/universe/model.js').GoodSeed    } GoodSeed
 * @typedef { import('../../types/universe/model.js').SystemSeed  } SystemSeed
 * @typedef { import('../../types/universe/model.js').StationSeed } StationSeed
 */
