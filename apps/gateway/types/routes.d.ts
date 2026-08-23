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
    rebuild: () => Promise<number>  // truncate + replay projections, POST /admin/rebuild
    producer: RoutesProducer  /*
        requested_by on outgoing commands,
        garage app name - default 'gateway' */
    service?: string
    /** absolute or cwd-relative path to the served client html - css/js/img are siblings of it */
    clientPath: string
}

/**
 * builds the gateway's garage app:
 * - `GET /` `/universe` - the html client, and stations/routes/goods/constants (public)
 * - `GET /pub/:file(.*)` - clientPath's directory served generically -
 *   css/js/img siblings, incl. the client's module graph (public)
 * - `GET /garage/:file(.*)` - browser-safe subset of the `garage` package's
 *   source (util/sync/mime/constants/use), for the client's import map (public)
 * - `POST /register` `/login` - correlated reply over events.player
 * - `POST /travel` `/buy` `/sell` - command → 202 `{ cmd, correlation_id }`, pid from token claims
 * - `GET /me` `/ships` `/cargo/:sid` `/market/:stid` `/trades` - projection reads
 * - `GET /traffic` `/station/:stid/ships` - public ship traffic, one shared
 *   query, handle instead of pid
 * - `GET /admin/players` `/admin/events` `/admin/inventory/:stid`
 *   `POST /admin/rebuild` - admin-role reads + rebuild trigger
 * - bearer-jwt auth middleware, `Fail.code` → http status (417 → 400)
 * - `requireRole('admin')` guards every `/admin/*` route
 */
export function createRoutes(input: RoutesInput): Garage
