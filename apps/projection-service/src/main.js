import { bootService, isMain } from '@theseus/config'

export const serviceName = 'projection-service'

export function describeService() {
    return {
        service: serviceName,
        role   : 'event log and disposable read models',
        owns   : [ 'event_log', 'read_models' ],
    }
}

if (isMain(import.meta.url))
    bootService(describeService())
