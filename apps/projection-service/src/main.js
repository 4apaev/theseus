import { fileURLToPath       } from 'node:url'
import { bootService, isMain } from '@theseus/config'
import { createConsumer      } from '@theseus/kafka'
import { eventTopics         } from '@theseus/contracts'
import { DB, Inbox, migrate  } from '@theseus/db'

import { createHandlers } from './handlers.js'

export const service = 'projection-service'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

export function describeService() {
    return {
        service,
        role: 'event log and disposable read models',
        owns: [ 'event_log', 'read_models' ],
    }
}

export async function start(client) {
    const pool = DB.create({ schema: 'projection' })
    await migrate(pool)
    await migrate(pool, MIGRATIONS)

    const dispatch = createHandlers(pool)
    const store    = Inbox.create(pool)

    const consumer = createConsumer({
        store,
        client,
        groupId: service,
        topics : [ eventTopics.all ],
        async handler(msg) {
            const fx = dispatch[ msg.value?.event_type ]
            fx && await fx(msg.value)
        },
    })

    return {
        stats() { return consumer.stats() },
        stop()  { consumer.stop(); pool.end() },
    }
}

// ── BOOT ─────────────────────────────────────────────────────
isMain(import.meta.url) && bootService(describeService())
