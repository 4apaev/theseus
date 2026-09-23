// @ts-check

/*
    the measures of space, and the clock that crosses it.
    nothing here knows about a station or a good.
*/

/** one astronomical unit, in light years */
export const ASTRONOMICAL_UNIT = 1 / 63241.077

/**
 * the peak speed of an in-system route, in fractions of light speed.
 * 0.00008c is 24 km/s - 1.5 times voyager 2's speed. the cap limits a
 * strong drive, so a short hop still takes game time. it also holds
 * every in-system speed far below light, so an in-system leg has no
 * time dilation.
 */
export const SUBLIGHT = 0.00008

/** m/s */
export const LIGHT = 299792458

/** seconds in a julian year */
export const YEAR = 31557600

/** metres in a light year */
export const LY = LIGHT * YEAR

/**
 * one orbit gap, in light years.
 *
 * @param  {number} au - astronomical units
 * @return {number} light years
 */
export function lightYears(au) {
    return au * ASTRONOMICAL_UNIT
}

/**
 * the time of one leg, in years.
 *
 * a route between stars holds one speed for the whole leg.
 * an in-system route accelerates to the midpoint, flips,
 * then decelerates, and never passes `c`.
 * see the domain readme, "the 2 travel models".
 *
 * @param {number} ly           - the leg, in light years
 * @param {number} c            - the route speed limit, in fractions of light speed
 * @param {number} velocity     - the ship cruise velocity, in fractions of light speed
 * @param {number} acceleration - the ship acceleration, in m/s²
 * @return {number} years
 */
export function legTime(ly, c, velocity, acceleration) {
    if (c >= 1)
        return ly / Math.min(velocity, c)

    const d = ly * LY      // metres
    const v = c * LIGHT    // m/s

    const seconds = Math.sqrt(acceleration * d) <= v
        ? 2 * Math.sqrt(d / acceleration)
        : d / v + v / acceleration

    return seconds / YEAR
}
