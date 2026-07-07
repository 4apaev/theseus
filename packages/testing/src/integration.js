import { setTimeout } from 'node:timers/promises'

import { Codec }             from '@theseus/kafka'
import { formatTime, guid }  from '@theseus/util'
import { createCommandEnvelope } from '@theseus/contracts'

export { guid }

export async function waitFor(fx, ms = 5000, interval = 50, ...a) {
    ms = formatTime(ms)
    interval = formatTime(interval)

    const deadline = Date.now() + ms

    while (Date.now() < deadline) {
        const rs = await fx(...a)
        if (rs) return rs
        await setTimeout(interval)
    }
    throw new Error('waitFor timed out')
}

export function createPublisher(producer, rqby = 'integration-test') {
    return (type, payload) => producer.publishCommand(createCommandEnvelope({
        cmd         : guid(),
        command_type: type,
        requested_by: rqby,
        payload,
    }))
}

export function collectEvents(kafka, topics) {
    const events = []
    const sub = kafka.subscribe({
        topics,
        groupId: guid('test'),
        handler(msg) {
            return events.push(Codec.decode(msg.value))
        },
    })
    return {
        events,
        stop() { return sub.stop() },
    }
}
