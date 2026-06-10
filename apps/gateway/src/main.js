export const serviceName = 'gateway'

export function describeService() {
    return {
        service: serviceName,
        role   : 'http api and websocket gateway',
        owns   : [],
    }
}
