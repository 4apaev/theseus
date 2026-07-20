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
    producer: RoutesProducer  /*
        requested_by on outgoing commands,
        garage app name - default 'gateway' */
    service?: string
}

/**
 * builds the gateway's garage app:
 * - `POST /register` `/login` - correlated reply over events.player
 * - `POST /travel` `/buy` `/sell` - command → 202 `{ cmd, correlation_id }`, pid from token claims
 * - `GET /me` `/ships` `/cargo/:sid` `/market/:stid` `/trades` - projection reads
 * - bearer-jwt auth middleware, `Fail.code` → http status (417 → 400)
 */
export function createRoutes(input: RoutesInput): Garage
