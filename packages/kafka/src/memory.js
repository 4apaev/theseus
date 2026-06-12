import { Is, Fail } from 'garage/util'

export function createMemoryKafka() {
    let offset = 0
    const subs = []
    const log = []

    return {
        messages(topic) {
            return log.filter(msg => msg.topic === topic)
        },

        async publish(rec) {
            const batch = normalizeRecord(rec)
            const stored = batch.messages.map(msg => ({
                key      : msg.key ?? void 0,
                value    : toBuffer(msg.value),
                topic    : batch.topic,
                offset   : String(offset++),
                partition: 0,
            }))

            log.push(...stored)

            for (const message of stored) {
                await deliver({
                    message,
                    subscriptions: subs,
                })
            }

            return {
                count: stored.length,
                topic: batch.topic,
            }
        },

        subscribe(input) {
            const sub = {
                active : true,
                groupId: input.groupId,
                handler: input.handler,
                topics : new Set(input.topics),
            }

            subs.push(sub)

            return {
                stop() {
                    sub.active = false
                },
            }
        },
    }
}

async function deliver(input) {
    const targets = subscriptionsFor(input.subscriptions, input.message.topic)

    await Promise.all(targets.map(sub => sub.handler(input.message)))
}

function normalizeRecord(rec) {
    Fail.ok(
        Is.o(rec) && Is.s(rec.topic) && Is.a(rec.messages),
        'kafka record must have topic and messages',
    )
    return rec
}

function subscriptionsFor(subs, topic) {
    return subs.filter(sub => sub.active && sub.topics.has(topic))
}

function toBuffer(x) {
    return Buffer.isBuffer(x)
        ? x
        : Buffer.from(Is.s(x)
            ? x
            : JSON.stringify(x), 'utf8')
}
