import { fileURLToPath } from 'node:url'

import {
    readEnv,
    requireEnv,
    bootService,
} from '@theseus/config'

import {
    createConsumer,
    createProducer,
    createKafkaClient,
} from '@theseus/kafka'

import {
    DB,
    Inbox,
    Outbox,
    migrate,
} from '@theseus/db'

/*
    the shared service lifecycle every main.js used to copy:
    pool → migrate → seed → producer → inbox → outbox → consumer.

    subclass sets the static fields, provides handlers(),
    optionally overrides seed(); deps arrive via the constructor.
*/
export default class Service {

    static schema     = ''      // pg schema this service owns
    static service    = ''      // consumer group + boot log name
    static migrations = ''      // path to the app's migrations dir
    static outbox     = true    // projection-style consumers set false
    static topics     = []      // kafka topics to consume
    static owns       = []
    static role       = ''      // for describe()

    /** @type { ReturnType<typeof Outbox.poll> | undefined } */
    outbox

    constructor({ client, pool } = {}) {
        this.client = client
        this.pool   = pool ?? DB.create({ schema: new.target.schema })
    }

    handlers() { return {} }
    async seed() {}

    async start() {
        const ctor = this.constructor

        await migrate(this.pool)
        await migrate(this.pool, fileURLToPath(ctor.migrations))
        await this.seed()

        this.producer = createProducer({ client: this.client })
        this.store    = Inbox.create(this.pool)

        if (ctor.outbox) {
            this.outbox = Outbox.poll(this.pool, this.producer.publish, {
                interval: readEnv('OUTBOX_INTERVAL', 1000),
            })
        }

        const dispatch = this.handlers()

        this.consumer = createConsumer({
            store  : this.store,
            client : this.client,
            groupId: ctor.service,
            topics : ctor.topics,
            async handler({ value }) {
                const fx = dispatch[ value?.command_type ?? value?.event_type ]
                fx && await fx(value)
            },
        })
        return this
    }

    stats() {
        return this.consumer.stats()
    }

    stop() {
        this.consumer?.stop()
        this.outbox?.stop()
        this.pool.end()
    }

    static describe() {
        return {
            service: this.service,
            role   : this.role,
            owns   : this.owns,
        }
    }

    static of() {
        return Reflect.construct(this, arguments)
    }

    // real broker client from env, boot log, signal handling
    static async run() {
        bootService(this.describe())

        const client = createKafkaClient({
            clientId: this.service,
            brokers : [ `${
                requireEnv('KAFKA_HOST') }:${
                requireEnv('KAFKA_PORT')
            }` ],
        })

        const service = await this.of({ client }).start()
        const stop = async () => {
            service.stop()
            await client.stop()
            process.exit(0)
        }

        process.once('SIGINT', stop)
        process.once('SIGTERM', stop)
        return service
    }
}
