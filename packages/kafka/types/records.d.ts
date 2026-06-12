import type {
    AnyCommandEnvelope,
    AnyEventEnvelope,
} from '@theseus/contracts'

export interface TopicRecordInput<T = unknown> {
    topic: string
    key?: string | null
    value: T
}

export interface TopicRecordMessage {
    key?: string | null
    value: Buffer
}

export interface TopicRecord {
    topic: string
    messages: TopicRecordMessage[]
}

export interface RawTopicMessage {
    key?: string | null
    offset?: string
    partition?: number
    topic: string
    value: Buffer
}

export interface DecodedTopicMessage<T = unknown> {
    key?: string | null
    offset?: string
    partition?: number
    topic: string
    value: T
}

export function createTopicRecord<T>(input: TopicRecordInput<T>): TopicRecord
export function createCommandRecord(command: AnyCommandEnvelope): TopicRecord
export function createEventRecords(event: AnyEventEnvelope, options?: { includeAll?: boolean }): TopicRecord[]
export function decodeTopicMessage<T = unknown>(record: RawTopicMessage): DecodedTopicMessage<T>
