import { bootService, isMain } from '../../../packages/config/src/index.js'

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
