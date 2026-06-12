import { bootService, isMain } from '@theseus/config'

export const service = 'ship-service'

export function describeService() {
    return {
        service,
        role: 'ships, travel, locations, and cargo holds',
        owns: [ 'ships', 'ship_cargo', 'travel_schedules' ],
    }
}

isMain(import.meta.url) && bootService(describeService())
