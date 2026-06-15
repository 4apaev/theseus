import { fileURLToPath                  } from 'node:url'
import { DB, Inbox, Outbox, migrate     } from '@theseus/db'
import { bootService, isMain            } from '@theseus/config'
import { createConsumer, createProducer } from '@theseus/kafka'
import { commandTopics                  } from '@theseus/contracts'
import { createHandlers                 } from './handlers.js'

export const service = 'player-service'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

export default start

export function describeService() {
    return {
        service,
        role: 'players, sessions, and wallets',
        owns: [ 'players', 'wallets' ],
    }
}

export async function start(kafka) {
    const pool = DB.create()
    await migrate(pool)
    await migrate(pool, MIGRATIONS)

    const producer = createProducer({ client: kafka })
    const dispatch = createHandlers(pool, DB.transact)
    const store    = Inbox.create(pool)

    Outbox.poll(pool, producer.publish)

    return createConsumer({
        client : kafka,
        groupId: service,
        topics : [ commandTopics.player, commandTopics.wallet ],
        store,
        async handler(msg) {
            const fn = dispatch[ msg.value?.command_type ]
            fn && await fn(msg.value)
        },
    })
}

// ── BOOT ─────────────────────────────────────────────────────
isMain(import.meta.url) && bootService(describeService())
