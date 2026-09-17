// @ts-check

import {
    legTime,
    universe,
    TIME_SCALE,
} from '@theseus/domain'

export default travel

/*
    the route's own c picks the model - legTime() holds both.
    a leg between stars costs the pilot less time than the clock.
    an in-system leg stays far below light, so both clocks agree.
*/

/**
 * @param {string} from
 * @param {string} to
 * @param {number} velocity     - fractions of light speed
 * @param {number} acceleration - m/s²
 * @return {{ ms: number, arrives: string, years_abs: number, years_rel: number }}
 */
export function travel(from, to, velocity, acceleration) {

    // c is the speed limit of the route,
    // in fractions of light speed.
    const { ly, c } = universe.route(from, to)

    const abs     = legTime(ly, c, velocity, acceleration)
    const rel     = c < 1 ? abs : abs * Math.sqrt(1 - Math.min(velocity, c) ** 2)
    const ms      = abs * TIME_SCALE * 1000
    const arrives = new Date(Date.now() + ms).toISOString()

    return {
        ms,
        arrives,
        years_abs: abs,
        years_rel: rel,
    }
}

export const distance = travel.distance = universe.distance.bind(universe)
