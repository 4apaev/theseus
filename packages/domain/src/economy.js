import { Is, Fail } from 'garage/util'

/*
    supply & demand price math - pure functions.
    market-service (step 6) feeds these with live stock levels;
    stock below target → price rises, glut → price falls.
*/

export function price(base, stock, target, elasticity = 1) {
    assertPositive(base, 'base')
    assertPositive(target, 'target')
    assertPositive(elasticity, 'elasticity')
    Fail.ok(Is.n(stock) && stock >= 0, 411, '"stock" must be a non-negative number')

    return base * (target / Math.max(stock, 1)) ** elasticity
}

export function spread(px, margin = 0.1) {
    assertPositive(px, 'price')
    Fail.ok(Is.n(margin) && margin >= 0 && margin < 1, 416, '"margin" must be in [0, 1)')

    return {
        price_buy : px * (1 + margin), // player buys from station above spot
        price_sell: px * (1 - margin), // player sells to station below spot
    }
}

function assertPositive(value, name) {
    Fail.ok(Is.n(value) && value > 0, 411, `"${ name }" must be finite and positive`)
}
