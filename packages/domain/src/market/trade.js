// @ts-check

import { Is, Fail } from '@theseus/util'

/*
    the cost of time. a voyage takes years, and the 2 frames disagree
    on how many - the universe counts one number, the crew another.
    interest runs on the universe's clock, because that is the clock
    the lender keeps.
*/

/**
 * the years a leg takes, as the universe counts them.
 *
 * @param {number} ly - light years
 * @param {number} c  - velocity, in fractions of light speed
 * @return {number} years
 */
export function commonFrameYears(ly, c) {
    float(c, 'velocity')
    positive(ly, 'light years distance')

    return ly / c
}

/**
 * the years a leg takes, as the crew counts them. the faster the ship,
 * the fewer they are.
 *
 * @param {number} ly - light years
 * @param {number} c  - velocity, in fractions of light speed
 * @return {number} years
 */
export function shipFrameYears(ly, c) {
    const years = commonFrameYears(ly, c)
    return years * Math.sqrt(1 - c ** 2)
}

/**
 * common years to the seconds a player waits.
 *
 * @param {number} years   - common years
 * @param {number} seconds - seconds per year, the game tempo
 * @return {number} seconds
 */
export function gameSeconds(years, seconds) {
    positive(years, 'common years')
    positive(seconds, 'seconds per year')

    return years * seconds
}

/**
 * what a principal grows to over the voyage. the cargo must beat this
 * number, or the trip lost money.
 *
 * @param {number} principal
 * @param {number} interest  - per year
 * @param {number} years     - common years
 * @return {number}
 */
export function capitalCost(principal, interest, years) {
    positive(years, 'common years')
    positive(interest, 'interest rate')
    positive(principal, 'principal')

    return principal * (1 + interest) ** years
}

/**
 * @param {number} x
 * @param {string} name
 */
function positive(x, name) {
    Is.n(x) || Fail.raise(411, `"${ name }" must be finite`, x, positive)
    x > 0   || Fail.raise(411, `"${ name }" must be positive`, x, positive)
}

/**
 * a velocity, as a fraction of light speed. nothing reaches 1.
 *
 * @param {number} x
 * @param {string} name
 */
function float(x, name) {
    Is.n(x) || Fail.raise(416, `"${ name }" must be finite`, x, float)
    x < 1   || Fail.raise(416, `"${ name }" must be less than 1`, x, float)
}
