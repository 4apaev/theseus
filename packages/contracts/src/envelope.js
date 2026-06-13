import { validateCommand } from './commands.js'
import { validateEvent } from './events.js'

export function createCommandEnvelope(input) {
    const cmd = input.cmd

    return validateCommand({
        cmd,
        command_type  : input.command_type,
        requested     : input.requested ?? (new Date).toISOString(),
        requested_by  : input.requested_by ?? 'anonymous',
        correlation_id: input.correlation_id ?? cmd,
        payload       : input.payload ?? {},
    })
}

export function createEventEnvelope(input) {
    const eid = input.eid

    return validateEvent({
        eid,
        event_type       : input.event_type,
        aggregate_type   : input.aggregate_type,
        aggregate_id     : input.aggregate_id,
        aggregate_version: input.aggregate_version,
        occurred         : input.occurred ?? (new Date).toISOString(),
        causation_id     : input.causation_id,
        correlation_id   : input.correlation_id ?? input.causation_id ?? eid,
        producer         : input.producer,
        payload          : input.payload ?? {},
    })
}
