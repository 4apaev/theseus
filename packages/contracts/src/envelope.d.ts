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
    command_id: string
    command_type: T
    requested_at?: string
    requested_by?: string
    correlation_id?: string
    payload: CommandPayloads[T]
}

export type EventEnvelopeInput<T extends EventType> = {
    event_id: string
    event_type: T
    aggregate_type: string
    aggregate_id: string
    aggregate_version: number
    occurred_at?: string
    occurred?: string
    causation_id?: string
    correlation_id?: string
    producer: string
    payload: EventPayloads[T]
}

export function createCommandEnvelope<T extends CommandType>(input: CommandEnvelopeInput<T>): CommandEnvelope<T>
export function createEventEnvelope<T extends EventType>(input: EventEnvelopeInput<T>): EventEnvelope<T>
