import type { KafkaConsumerClient } from './consumer.js'
import type { ProducerClient } from './producer.js'

export interface KafkaClientInput {
    brokers: string[]
    clientId: string
}

export type KafkaClient = KafkaConsumerClient & ProducerClient & {
    stop(): Promise<void>
}

export function createKafkaClient(input: KafkaClientInput): KafkaClient
