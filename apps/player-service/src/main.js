export const serviceName = 'player-service'

export function describeService() {
    return {
        service: serviceName,
        role   : 'players, sessions, and wallets',
        owns   : [ 'players', 'wallets' ],
    }
}
