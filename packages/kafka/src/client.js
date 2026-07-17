import { setTimeout      } from 'node:timers/promises'
import { Kafka, logLevel } from 'kafkajs'

/*
    real broker adapter - same contract createMemoryKafka defines:

        publish({ topic, messages })            → { count, topic }
        subscribe({ groupId, topics, handler }) → { stop }

    deliberately naive on rebalancing / retries - kafkajs defaults
    handle the first pass, the game is not a bank.
*/
export function createKafkaClient({ brokers, clientId }) {
    const kafka = new Kafka({
        brokers,
        clientId,
        logLevel: logLevel.ERROR,
    })

    const consumers = []
    const producer  = kafka.producer()

    let connected
    const connect = () => connected ??= producer.connect()
    const disconnect = c => c.disconnect()

    // fresh brokers auto-create topics on produce, not on subscribe -
    // a consumer of a never-produced topic dies with UNKNOWN_TOPIC_OR_PARTITION.
    // serialized per client: parallel createTopics calls race each other
    const ensured = new Set
    let creating  = Promise.resolve()

    function ensure(topics) {
        return creating = creating.then(async () => {
            const missing = topics.filter(t => !ensured.has(t))
            if (!missing.length) return

            const admin = kafka.admin()
            await admin.connect()
            try {
                await admin.createTopics({
                    topics        : missing.map(topic => ({ topic })),
                    waitForLeaders: true,
                })
                missing.forEach(t => ensured.add(t))
            }
            finally {
                await admin.disconnect()
            }
        })
    }

    return {
        async publish({ topic, messages }) {
            await connect()
            await producer.send({ topic, messages })
            return { count: messages.length, topic }
        },

        subscribe({ groupId, topics, handler }) {
            const consumer = kafka.consumer({ groupId })
            consumers.push(consumer)

            // sub is handed back synchronously, like the memory client -
            // the connect chain settles in the background; transient broker
            // errors (metadata propagation, group coordinator) get retried
            const running = (async () => {
                for (let attempt = 1; ; attempt++) {
                    try {
                        await ensure(topics)
                        await consumer.connect()
                        await consumer.subscribe({ topics, fromBeginning: true })
                        return await consumer.run({
                            eachMessage({ topic, partition, message }) {
                                return handler({
                                    topic,
                                    partition,
                                    offset: message.offset,
                                    key   : message.key?.toString(),
                                    value : message.value,
                                })
                            },
                        })
                    }
                    catch (e) {
                        if (attempt >= 5)
                            return console.error(`kafka ⋮ ${ groupId } subscribe failed -`, e.message)
                        await setTimeout(300 * attempt)
                    }
                }
            })()

            return {
                async stop() {
                    await running
                    return disconnect(consumer)
                },
            }
        },

        async stop() {
            await Promise.allSettled([
                producer.disconnect(),
                ...consumers.map(disconnect),
            ])
        },
    }
}
