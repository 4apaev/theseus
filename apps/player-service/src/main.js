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

export async function start(client) {
    const pool = DB.create({ schema: 'player' })
    await migrate(pool)
    await migrate(pool, MIGRATIONS)

    const producer = createProducer({ client })
    const dispatch = createHandlers(pool, DB.transact)
    const store    = Inbox.create(pool)

    const outbox   = Outbox.poll(pool, producer.publish)
    const consumer = createConsumer({
        store,
        client,
        groupId: service,
        topics : [ commandTopics.player, commandTopics.wallet ],
        async handler(msg) {
            const fx = dispatch[ msg.value?.command_type ]
            fx && await fx(msg.value)
        },
    })

    return {
        stats: () => consumer.stats(),
        stop()  { consumer.stop(); outbox.stop(); pool.end() },
    }
}

// ── BOOT ─────────────────────────────────────────────────────
isMain(import.meta.url) && bootService(describeService())
