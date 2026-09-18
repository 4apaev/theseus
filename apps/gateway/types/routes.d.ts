import type { Garage      } from 'garage'
import type { Auth        } from '@theseus/auth'
import type { TopicRecord } from '@theseus/kafka'

import type { Queries } from './queries.js'
import type { Replies } from './replies.js'

export interface RoutesProducer {
    publish(rec: TopicRecord): unknown
}

export interface RoutesInput {
    jwt: Auth
    waiter: Replies
    queries: Queries
    rebuild: () => Promise<number>  // truncate + replay projections, POST /api/admin/rebuild
    producer: RoutesProducer
    service?: string   // requested_by on outgoing commands, garage app name - default 'gateway'
    clientPath: string // absolute or cwd-relative path to the client assets
    nodeEnv?: string   // default 'dev', 'test' skips logger
}

export function createRoutes(input: RoutesInput): Garage
