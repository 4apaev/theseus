import type {
    AnyEventEnvelope,
    AnyCommandEnvelope,
} from '@theseus/contracts'

import type { PublishResult } from './memory.js'
import type { TopicRecord } from './records.js'

export interface ProducerClient {
    publish(rec: TopicRecord): PublishResult | Promise<PublishResult>
}

export interface ProducerInput {
    client: ProducerClient
    publishAllEvents?: boolean
}

export interface Producer {
    publish(rec: TopicRecord): PublishResult | Promise<PublishResult>
    publishCommand(cmd: AnyCommandEnvelope): PublishResult | Promise<PublishResult>
    publishEvent(e: AnyEventEnvelope): Promise<PublishResult[]>
}

export function createProducer(input: ProducerInput): Producer
