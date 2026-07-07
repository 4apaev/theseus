import Crypto         from 'node:crypto'
import { setTimeout } from 'node:timers/promises'

import { Codec }                 from '@theseus/kafka'
import { formatTime }            from '@theseus/util'
import { createCommandEnvelope } from '@theseus/contracts'

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

export function guid(prfx = 'itg_') {
    return prfx + Crypto.randomUUID().slice(0, 8)
}

export function createPublisher(producer, rqby = 'integration-test') {
    return (type, payload) => producer.publishCommand(createCommandEnvelope({
        cmd         : Crypto.randomUUID(),
        command_type: type,
        requested_by: rqby,
        payload,
    }))
}

export function collectEvents(kafka, topics) {
    const events = []
    const sub = kafka.subscribe({
        topics,
        groupId: 'test-' + Crypto.randomUUID(),
        handler(msg) {
            return events.push(Codec.decode(msg.value))
        },
    })
    return {
        events,
        stop() { return sub.stop() },
    }
}
