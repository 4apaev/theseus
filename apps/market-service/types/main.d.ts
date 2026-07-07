import type { ServiceDescription } from '@theseus/config'
import type { KafkaConsumerClient } from '@theseus/kafka'

export const service: 'market-service'
export function describeService(): ServiceDescription
export function start(client: KafkaConsumerClient): Promise<{ stats(): unknown; stop(): void }>
export default start
