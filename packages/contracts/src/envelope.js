export function createCommandEnvelope(input) {
    const cid = input.command_id

    return {
        command_id    : cid,
        command_type  : input.command_type,
        requested_at  : input.requested_at ?? (new Date).toISOString(),
        requested_by  : input.requested_by,
        correlation_id: input.correlation_id ?? cid,
        payload       : input.payload ?? {},
    }
}

export function createEventEnvelope(input) {
    const eid = input.event_id

    return {
        event_id         : eid,
        event_type       : input.event_type,
        aggregate_type   : input.aggregate_type,
        aggregate_id     : input.aggregate_id,
        aggregate_version: input.aggregate_version,
        occurred_at      : input.occurred_at ?? (new Date).toISOString(),
        causation_id     : input.causation_id,
        correlation_id   : input.correlation_id ?? input.causation_id ?? eid,
        producer         : input.producer,
        payload          : input.payload ?? {},
    }
}
