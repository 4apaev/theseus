import { bootService, isMain } from '../../../packages/config/src/index.js'

export const serviceName = 'market-service'

export function describeService() {
    return {
        service: serviceName,
        role   : 'station markets, prices, inventory, and trade sagas',
        owns   : [ 'markets', 'station_inventory', 'trades' ],
    }
}

if (isMain(import.meta.url))
    bootService(describeService())
