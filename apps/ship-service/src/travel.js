import { readEnv } from '@theseus/config'
import { O, Fail, each } from '@theseus/util'

const TIME_SCALE = readEnv('TIME_SCALE', 20)

const DISTANCES = ((map, out) => each(map, (k, v) => out[ sortRoute(k) ] = v, out))({
    'sol.outpost:alpha.exchange'  : 4.3,
    'sol.outpost:barnards.port'   : 6.0,
    'alpha.exchange:barnards.port': 5.9,
}, O.o)

function sortRoute(route) {
    return route.split(':').sort().join(':')
}

export function distance(from, to) {
    const k  = [ from, to ].sort().join(':')
    k in DISTANCES || Fail.raise(`unknown route: ${ from } → ${ to }`)
    return DISTANCES[ k ]
}

export default travel
export function travel(from, to, velocity) {
    const ly      = distance(from, to)
    const abs     = ly / velocity
    const rel     = abs * Math.sqrt(1 - velocity ** 2)
    const ms      = abs * TIME_SCALE * 1000
    const arrives = new Date(Date.now() + ms).toISOString()

    return {
        ms,
        arrives,
        years_abs: abs,
        years_rel: rel,
    }
}

/*
export class Route {
    constructor(from, to) {
        this.to = to
        this.from = from
        this.slug = [ to, from ].sort().join(':')
    }

    travel(velocity) {
        return travel(this.from, this.to, velocity)
    }
}
 */
