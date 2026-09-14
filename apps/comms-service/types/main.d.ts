import type { ServiceDescription } from '@theseus/config'
import type { KafkaConsumerClient } from '@theseus/kafka'
import type { Poller } from '@theseus/util'

export const service: 'comms-service'
export function describeService(): ServiceDescription
export function start(client: KafkaConsumerClient): Promise<{
    stats(): unknown
    stop(): void
    delivery: Poller
}>
export default start
