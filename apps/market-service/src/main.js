import { fileURLToPath } from 'node:url'
import {
    commandTopics,
    eventTopics,
} from '@theseus/contracts'

import {
    isMain,
    bootService,
} from '@theseus/config'

import {
    createConsumer,
    createProducer,
} from '@theseus/kafka'

import {
    DB,
    Inbox,
    Outbox,
    migrate,
} from '@theseus/db'

import { seed           } from './seed.js'
import { createHandlers } from './handlers.js'

export const service = 'market-service'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

export function describeService() {
    return {
        service,
        role: 'station markets, prices, inventory, and trade sagas',
        owns: [
            'cargo',
            'trades',
            'markets',
            'station_inventory',
        ],
    }
}

export default start
export async function start(client) {
    const pool = DB.create({ schema: 'market' })
    await migrate(pool)         // runs @theseus/db's shared migrations
    await migrate(pool, MIGRATIONS)
    await seed(pool, DB.transact)

    const producer = createProducer({ client })
    const dispatch = createHandlers(pool, DB.transact)
    const store    = Inbox.create(pool)

    const outbox   = Outbox.poll(pool, producer.publish)
    const consumer = createConsumer({
        store,
        client,
        groupId: service,
        topics : [
            commandTopics.market,
            eventTopics.wallet,
            eventTopics.ship,
        ],
        async handler(msg) {
            const fx = dispatch[ msg.value?.command_type ?? msg.value?.event_type ]
            fx && await fx(msg.value)
        },
    })

    return {
        stats() { return consumer.stats() },
        stop()  { consumer.stop(), outbox.stop(), pool.end() },
    }
}

// ── BOOT ─────────────────────────────────────────────────────
isMain(import.meta.url) && bootService(describeService())
