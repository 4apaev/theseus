import { fileURLToPath                    } from 'node:url'
import { bootService, isMain              } from '@theseus/config'
import { createPool, migrate, createInbox } from '@theseus/db'
import { createConsumer                   } from '@theseus/kafka'
import { eventTopics as ET                } from '@theseus/contracts'

import { createHandlers                   } from './handlers.js'

export const service = 'projection-service'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

export function describeService() {
    return {
        service,
        role: 'event log and disposable read models',
        owns: [ 'event_log', 'read_models' ],
    }
}

export async function start(kafka) {
    const pool = createPool()
    await migrate(pool)
    await migrate(pool, MIGRATIONS)

    const dispatch = createHandlers(pool)
    const store    = createInbox(pool)

    return createConsumer({
        client : kafka,
        groupId: service,
        topics : [ ET.all ],
        store,
        async handler(msg) {
            const fx = dispatch[ msg.value?.event_type ]
            fx && await fx(msg.value)
        },
    })
}

// ── BOOT ─────────────────────────────────────────────────────
isMain(import.meta.url) && bootService(describeService())
