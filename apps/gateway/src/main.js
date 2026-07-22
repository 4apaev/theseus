import { DB } from '@theseus/db'
import { create } from '@theseus/auth'
import { eventTopics } from '@theseus/contracts'
import {
    createProducer,
    createKafkaClient,
    decodeTopicMessage,
} from '@theseus/kafka'
import {
    isMain,
    readEnv,
    requireEnv,
    bootService,
} from '@theseus/config'

import { createFeed    } from './feed.js'
import { createRoutes  } from './routes.js'
import { createQueries } from './queries.js'
import { createReplies } from './replies.js'

export { createRoutes, createQueries, createReplies }
export const service = 'gateway'

export function describeService() {
    return {
        service,
        uptime: process.uptime(),
        role: 'http api and websocket gateway',
        owns: [],
    }
}

/*  stateless edge: no schema, no inbox/outbox - commands out through
    the producer, reads from projection, one event feed shared by the
    reply waiter and the websocket fanout */
export async function start(client, opt = {}) {
    const owned    = !opt.pool
    const pool     = opt.pool ?? DB.create({ schema: 'projection' })
    const jwt      = create(opt.secret ?? requireEnv('JWT_SECRET'), opt.ttl ?? readEnv('JWT_TTL', '7d'))
    const producer = createProducer({ client })
    const waiter   = createReplies(opt.timeout ?? readEnv('GATEWAY_REPLY_TIMEOUT', '5s'))
    const feed     = createFeed({ jwt, ping: opt.ping })
    const queries  = createQueries(pool)

    const app    = createRoutes({ producer, jwt, queries, waiter, service })
    const server = app.init()
    server.on('upgrade', (rq, socket) => feed.handleUpgrade(rq, socket))

    /*  stable group: resumes offsets across restarts instead of replaying
        the log at every boot. a second gateway instance would split the
        fanout - single instance for now */
    const subscription = client.subscribe({
        groupId: service,
        topics : [
            eventTopics.player,
            eventTopics.wallet,
            eventTopics.ship,
            eventTopics.cargo,
            eventTopics.market,
        ],
        handler(record) {
            const { value } = decodeTopicMessage(record)
            waiter.settle(value)
            feed.push(value)
        },
    })

    await new Promise(done => server.listen(opt.port ?? 0, done))

    return {
        server,
        feed,
        get port() { return server.address().port },
        async stop() {
            feed.close()
            subscription.stop()
            await new Promise(done => {
                server.close(done)
                server.closeAllConnections()      // keep-alive sockets outlive close()
            })
            owned && await pool.end()
        },
    }
}

export default start

async function run() {
    bootService(describeService())

    const client = createKafkaClient({
        clientId: service,
        brokers : [ `${
            requireEnv('KAFKA_HOST') }:${
            requireEnv('KAFKA_PORT')
        }` ],
    })

    const gateway = await start(client, { port: readEnv('GATEWAY_PORT', 3000) })
    const stop = async () => {
        await gateway.stop()
        await client.stop()
        process.exit(0)
    }

    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    return gateway
}

// ── BOOT ─────────────────────────────────────────────────────
isMain(import.meta.url) && run()
