import { bootService, isMain } from '../../../packages/config/src/index.js'

export const serviceName = 'player-service'

export function describeService() {
    return {
        service: serviceName,
        role   : 'players, sessions, and wallets',
        owns   : [ 'players', 'wallets' ],
    }
}

if (isMain(import.meta.url))
    bootService(describeService())
