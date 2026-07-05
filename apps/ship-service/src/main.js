import { fileURLToPath } from 'node:url'
import { commandTopics, eventTopics } from '@theseus/contracts'

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

import { createHandlers } from './handlers.js'

export const service = 'ship-service'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

export function describeService() {
    return {
        service,
        role: 'ships, travel, locations, and cargo holds',
        owns: [ 'ships' ],
    }
}

export default start
export async function start(client) {
    const pool = DB.create({ schema: 'ship' })
    await migrate(pool)         // runs @theseus/db's shared migrations
    await migrate(pool, MIGRATIONS)

    const producer = createProducer({ client })
    const dispatch = createHandlers(pool, DB.transact)
    const store    = Inbox.create(pool)

    const outbox   = Outbox.poll(pool, producer.publish)
    const consumer = createConsumer({
        store,
        client,
        groupId: service,
        topics : [ commandTopics.ship, eventTopics.player ],
        async handler(msg) {
            const emit = dispatch[ msg.value?.command_type ?? msg.value?.event_type ]
            emit && await emit(msg.value)
        },
    })

    return {
        stats() { return consumer.stats() },
        stop()  { consumer.stop(); outbox.stop(); pool.end() },
    }
}

// ── BOOT ─────────────────────────────────────────────────────
isMain(import.meta.url) && bootService(describeService())
