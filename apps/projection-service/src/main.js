export const serviceName = 'projection-service'

export function describeService() {
    return {
        service: serviceName,
        role   : 'event log and disposable read models',
        owns   : [ 'event_log', 'read_models' ],
    }
}
