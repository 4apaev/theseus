import { bootService, isMain } from '@theseus/config'

export const service = 'projection-service'

export function describeService() {
    return {
        service,
        role: 'event log and disposable read models',
        owns: [ 'event_log', 'read_models' ],
    }
}

isMain(import.meta.url) && bootService(describeService())
