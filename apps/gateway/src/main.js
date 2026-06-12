import { bootService, isMain } from '@theseus/config'

export const service = 'gateway'

export function describeService() {
    return {
        service,
        role: 'http api and websocket gateway',
        owns: [],
    }
}

isMain(import.meta.url) && bootService(describeService())
