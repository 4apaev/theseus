import { bootService, isMain } from '@theseus/config'

export const service = 'market-service'

export function describeService() {
    return {
        service,
        role: 'station markets, prices, inventory, and trade sagas',
        owns: [ 'markets', 'station_inventory', 'trades' ],
    }
}

isMain(import.meta.url) && bootService(describeService())
