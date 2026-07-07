import type { Pool } from 'pg'
import type { ServiceDescription } from '@theseus/config'
import type {
    Consumer,
    ConsumerStats,
    KafkaConsumerClient,
    Producer,
} from '@theseus/kafka'

export interface ServiceInput {
    client: KafkaConsumerClient
    pool?: Pool
}

declare class Service {
    static schema: string
    static service: string
    static migrations: string | URL
    static outbox: boolean
    static topics: string[]
    static owns: string[]
    static role: string

    static describe(): ServiceDescription
    static of<T extends typeof Service>(this: T, input?: ServiceInput): InstanceType<T>
    static run<T extends typeof Service>(this: T): Promise<InstanceType<T>>

    client: KafkaConsumerClient
    pool: Pool
    producer?: Producer
    consumer?: Consumer

    constructor(input?: ServiceInput)

    handlers(): Record<string, (msg: unknown) => unknown>
    seed(): Promise<unknown>
    start(): Promise<this>
    stats(): ConsumerStats
    stop(): void
}

export default Service
