import { Is, Fail } from 'garage/util'

export function commonFrameYears(distanceLy, velocityC) {
    assertPositive(distanceLy, 'distanceLy')
    assertVelocity(velocityC)

    return distanceLy / velocityC
}

export function shipFrameYears(distanceLy, velocityC) {
    const years = commonFrameYears(distanceLy, velocityC)

    return years * Math.sqrt(1 - velocityC ** 2)
}

export function gameSeconds(commonYears, secondsPerYear) {
    assertPositive(commonYears, 'commonYears')
    assertPositive(secondsPerYear, 'secondsPerYear')

    return commonYears * secondsPerYear
}

export function capitalCost(principal, interestRate, commonYears) {
    assertPositive(principal, 'principal')
    assertPositive(commonYears, 'commonYears')
    assertPositive(interestRate, 'interestRate')

    return principal * (1 + interestRate) ** commonYears
}

function assertPositive(value, name) {
    Fail.ok(Is.n(value) && value > 0, 411, `"${ name }" must be finite and positive`)
}

function assertVelocity(c) {
    assertPositive(c, 'velocityC')
    c < 1 || Fail.raise(416, 'velocityC must be less than 1')
}
