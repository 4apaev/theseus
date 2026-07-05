export function price(
    base: number,
    stock: number,
    target: number,
    elasticity?: number
): number

export function spread(
    px: number,
    margin?: number
): {
    price_buy: number
    price_sell: number
}
