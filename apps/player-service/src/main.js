import { bootService, isMain } from '@theseus/config'

export const service = 'player-service'

export function describeService() {
    return {
        service,
        role: 'players, sessions, and wallets',
        owns: [ 'players', 'wallets' ],
    }
}

isMain(import.meta.url) && bootService(describeService())
