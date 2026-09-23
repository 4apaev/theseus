/** one astronomical unit, in light years */
export declare const ASTRONOMICAL_UNIT: number

/** the peak speed of an in-system route, in fractions of light speed */
export declare const SUBLIGHT: number

/** m/s */
export declare const LIGHT: number

/** seconds in a julian year */
export declare const YEAR: number

/** metres in a light year */
export declare const LY: number

/** one orbit gap, from astronomical units to light years */
export declare function lightYears(au: number): number

/**
 *  the time of one leg, in years. a route between stars holds one
 *  speed. an in-system route accelerates to the midpoint, flips, then
 *  decelerates, and caps its peak speed at `c`.
 *
 *  @param ly           the leg, in light years
 *  @param c            the route speed limit, in fractions of light speed
 *  @param velocity     the ship cruise velocity, in fractions of light speed
 *  @param acceleration the ship acceleration, in m/s²
 */
export declare function legTime(
    ly: number,
    c: number,
    velocity: number,
    acceleration: number
): number
