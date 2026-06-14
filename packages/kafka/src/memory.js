import { Is, Fail } from 'garage/util'

export function createMemoryKafka() {
    let offset = 0
    const subs = []
    const log = []

    return {
        messages(topic) {
            return log.filter(msg => msg.topic === topic)
        },

        async publish({ topic, messages }) {
            Fail.ok(
                Is.s(topic)
                && Is.a(messages),
                'kafka record must have topic and messages',
            )

            let count = 0
            for (let { key, value } of messages) {
                key ??= void 0
                const msg = {
                    key,
                    topic,
                    offset   : String(offset),
                    partition: 0,
                    value    : toBuffer(value),
                }
                count++, offset++
                log.push(msg)
                await activeSubsFor(subs, msg)
            }

            return { count, topic }
        },

        subscribe({ groupId, handler, topics }) {
            const sub = {
                active: true,
                groupId,
                handler,
                topics: new Set(topics),
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

function activeSubsFor(subs, msg) {
    return Promise.all(subs.reduce((res, sub) => {
        sub.active
        && sub.topics.has(msg.topic)
        && res.push(sub.handler(msg))
        return res
    }, []))
}

function toBuffer(x) {
    return Buffer.isBuffer(x)
        ? x
        : Buffer.from(Is.s(x)
            ? x
            : JSON.stringify(x), 'utf8')
}
