// @ts-check

import { nil } from '@theseus/util'

/*
    the commodities. a module is a good too, and its row lives in
    modules.js beside the design - Design extends Good, so one seed row
    carries the trade half and the fitting half together.
*/

/** @type { Record<string, import('../../types/universe/model.js').GoodSeed> } */
export const goods = nil({
    ore  : { name: 'iron ore'   , price_base: 40, elasticity: 1.2, kind: 'commodity', volume: 1 },
    grain: { name: 'hydro grain', price_base: 25, elasticity: 1.0, kind: 'commodity', volume: 1 },
    spice: { name: 'void spice' , price_base: 90, elasticity: 1.5, kind: 'commodity', volume: 1 },
})
