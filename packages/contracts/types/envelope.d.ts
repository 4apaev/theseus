import type {
    CommandEnvelope,
    CommandPayloads,
    CommandType,
} from './commands.js'
import type {
    EventEnvelope,
    EventPayloads,
    EventType,
} from './events.js'

export type CommandEnvelopeInput<T extends CommandType> = {
    cmd: string
    command_type: T
    requested?: string
    requested_by?: string
    correlation_id?: string
    payload: CommandPayloads[T]
}

export type EventEnvelopeInput<T extends EventType> = {
    eid: string
    event_type: T
    aggregate_type: string
    aggregate_id: string
    aggregate_version: number
    occurred?: string
    causation_id?: string
    correlation_id?: string
    producer: string
    payload: EventPayloads[T]
}

export function createCommandEnvelope<T extends CommandType>(input: CommandEnvelopeInput<T>): CommandEnvelope<T>
export function createEventEnvelope<T extends EventType>(input: EventEnvelopeInput<T>): EventEnvelope<T>
