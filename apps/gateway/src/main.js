import { bootService, isMain } from '@theseus/config'

export const serviceName = 'gateway'

export function describeService() {
    return {
        service: serviceName,
        role   : 'http api and websocket gateway',
        owns   : [],
    }
}

if (isMain(import.meta.url))
    bootService(describeService())
