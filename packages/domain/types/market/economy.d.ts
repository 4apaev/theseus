/** the price of one unit against its stock */
export declare function price(
    base: number,
    stock: number,
    target: number,
    elasticity?: number
): number

/** the 2 sides of the spot price */
export declare function spread(
    px: number,
    margin?: number
): {
    price_buy: number
    price_sell: number
}
