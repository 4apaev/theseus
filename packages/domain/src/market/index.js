// @ts-check

/*
    the money half of the domain. economy prices a good against its
    stock, and trade puts a cost on the years a voyage takes. neither
    one knows a station or a ship - both are pure arithmetic.
*/

export {
    price,
    spread,
} from './economy.js'

export {
    capitalCost,
    commonFrameYears,
    gameSeconds,
    shipFrameYears,
} from './trade.js'
