// @ts-check

import { Is, Fail } from '@theseus/util'

/*
    supply & demand price math - pure functions.
    market-service (step 6) feeds these with live stock levels;
    stock below target → price rises, glut → price falls.
*/

/**
 * the spot price of one unit. a station that runs empty still quotes,
 * so stock takes 0 and the divisor never does.
 *
 * @param {number} base
 * @param {number} stock
 * @param {number} target
 * @param {number} [elastic]
 * @return {number}
 */
export function price(base, stock, target, elastic = 1) {
    positive(base, 'base')
    positive(target, 'target')
    positive(elastic, 'elasticity')
    positive(stock, 'stock', true)

    return base * (target / Math.max(stock, 1)) ** elastic
}

/**
 * the 2 sides of the spot price. the station asks above it and bids
 * below it, so one station is never an arbitrage.
 *
 * @param {number} px
 * @param {number} [margin] - in [0, 1)
 * @return {{ price_buy: number, price_sell: number }}
 */
export function spread(px, margin = 0.1) {
    positive(px, 'price')
    Fail.ok(Is.n(margin) && margin >= 0 && margin < 1, 416, '"margin" must be in [0, 1)')

    return {
        price_buy : px * (1 + margin), // player buys from station above spot
        price_sell: px * (1 - margin), // player sells to station below spot
    }
}

/**
 * @param {number} value
 * @param {string} name
 * @param {boolean} [zero] - true lets the value be 0
 */
function positive(value, name, zero) {
    Is.n(value) || Fail.raise(411, `"${ name }" must be finite`)

    const [ ok, msg ] = zero
        ? [ value >= 0, 'non-negative' ]
        : [ value > 0 , 'positive' ]

    ok || Fail.raise(411, `"${ name }" must be a ${ msg } number`)
}
