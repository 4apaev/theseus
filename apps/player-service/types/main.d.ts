import type { ServiceDescription } from '@theseus/config'
import type { KafkaConsumerClient, Consumer } from '@theseus/kafka'

export const service: 'player-service'
export function describeService(): ServiceDescription
export function start(kafka: KafkaConsumerClient): Promise<Consumer>
export default start
