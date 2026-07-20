import type { Server } from 'node:http'
import type { ServiceDescription } from '@theseus/config'
import type { KafkaConsumerClient } from '@theseus/kafka'
import type { Wss } from './ws.js'

export {
    type RoutesInput,
    type RoutesProducer,
    createRoutes,
} from './routes.js'

export {
    type Queries,
    type QueryPool,
    type PlayerOverview,
    type ShipRow,
    type CargoRow,
    type MarketPriceRow,
    type TradeRow,
    createQueries,
} from './queries.js'

export {
    type Replies,
    createReplies,
} from './replies.js'

export const service: 'gateway'
export function describeService(): ServiceDescription

export interface GatewayOptions {
    timeout?: string | number
    ttl?:     string | number
    ping?:    string | number
    port?:    number
    pool?:    unknown
    secret?:  string
}

export interface Gateway {
    readonly port: number
    server: Server
    stop(): Promise<void>
    wss: Wss
}

export function start(client: KafkaConsumerClient, opt?: GatewayOptions): Promise<Gateway>
export default start
