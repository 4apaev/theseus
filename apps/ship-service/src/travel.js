import { universe, TIME_SCALE } from '@theseus/domain'

export default travel

/*
    the route sets a speed limit.
    an in-system route caps the ship at a sublight transfer speed,
    so a short hop still takes game time.
    a route between stars sets 1, and the ship uses its own velocity.
    time dilation follows the ship's real speed.
    so a in-system slow hop, have no relativistic effects.
*/
export function travel(from, to, velocity) {

    // c is the speed limit of the route,
    // in fractions of light speed.
    const { ly, c } = universe.route(from, to)
    const v         = Math.min(velocity, c)

    const abs     = ly / v
    const rel     = abs * Math.sqrt(1 - v ** 2)
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
