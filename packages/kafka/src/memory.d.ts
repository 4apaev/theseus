import type {
    KafkaConsumerClient,
    KafkaSubscribeInput,
    KafkaSubscription,
} from './consumer.js'

import type {
    RawTopicMessage,
    TopicRecord,
} from './records.js'

export interface PublishResult {
    count: number
    topic: string
}

export interface MemoryKafka extends KafkaConsumerClient {
    messages(topic: string): RawTopicMessage[]
    publish(record: TopicRecord): Promise<PublishResult>
    subscribe(input: KafkaSubscribeInput): KafkaSubscription
}

export function createMemoryKafka(): MemoryKafka
