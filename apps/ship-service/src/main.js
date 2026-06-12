import { bootService, isMain } from '@theseus/config'

export const serviceName = 'ship-service'

export function describeService() {
    return {
        service: serviceName,
        role   : 'ships, travel, locations, and cargo holds',
        owns   : [ 'ships', 'ship_cargo', 'travel_schedules' ],
    }
}

if (isMain(import.meta.url))
    bootService(describeService())
