import type { MemoryMessageStore } from './idempotency.js'
import type {
    RawTopicMessage,
    DecodedTopicMessage,
} from './records.js'

export interface KafkaSubscription {
    stop(): void
}

export interface KafkaSubscribeInput {
    groupId: string
    topics: readonly string[]
    handler(record: RawTopicMessage): unknown | Promise<unknown>
}

export interface KafkaConsumerClient {
    subscribe(input: KafkaSubscribeInput): KafkaSubscription
}

export interface ConsumerInput<T = unknown> {
    client: KafkaConsumerClient
    groupId: string
    topics: readonly string[]
    store?: MemoryMessageStore
    handler(message: DecodedTopicMessage<T>): unknown | Promise<unknown>
}

export interface ConsumerStats {
    duplicates: number
    handled: number
}

export interface Consumer {
    stats(): ConsumerStats
    stop(): void
}

export function createConsumer<T = unknown>(input: ConsumerInput<T>): Consumer
