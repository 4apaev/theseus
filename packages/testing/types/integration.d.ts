import type { Producer, PublishResult, MemoryKafka } from '@theseus/kafka'
import type { AnyEventEnvelope } from '@theseus/contracts'

export function waitFor<T>(
    fx: () => T | Promise<T>,
    ms?: number,
    interval?: number
): Promise<T>

export function guid(prfx?: string): string

export function createPublisher(
    producer: Producer,
    requestedBy?: string
): (type: string, payload: object) => PublishResult | Promise<PublishResult>

export function collectEvents(
    kafka: MemoryKafka,
    topics: string[]
): {
    events: AnyEventEnvelope[]
    stop(): void
}
