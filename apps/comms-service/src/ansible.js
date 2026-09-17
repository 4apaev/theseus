// @ts-check
import {
    universe,
    TIME_SCALE,
    ANSIBLE_SPEED,
} from '@theseus/domain'

/**
 * @description
 *   a docked ship sits at one station. a transiting ship sits between
 *   2 - its current edge's ends. the signal takes the shortest path
 *   between any pair of the 2 ships' candidate points.
 *
 * @param {Ship} sender
 * @param {Ship} recipient
 * @return {number} the delay in milliseconds
 */
export function ansibleDelay(sender, recipient) {
    const ly = shortestDistance(candidates(sender), candidates(recipient))
    return ly / ANSIBLE_SPEED * TIME_SCALE * 1000
}

/**
 * @param {Ship} ship
 * @return {string[]}
 */
function candidates(ship) {
    return ship.stid ? [ ship.stid ] : [ ship.from, ship.to ]
}

/**
 * @param {string[]} from
 * @param {string[]} to
 * @return {number} light years
 */
function shortestDistance(from, to) {
    let ly = Infinity
    for (const a of from) {
        for (const b of to)
            ly = Math.min(ly, a === b ? 0 : universe.distanceTo(a, b))
    }
    return ly
}

/**
 * @typedef { import('../types/queries.js').QRShip } Ship
 */
