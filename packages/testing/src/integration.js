import { setTimeout } from 'node:timers/promises'

import { Codec }             from '@theseus/kafka'
import { createCommandEnvelope } from '@theseus/contracts'
import {
    A,
    wait,
    guid,
    formatTime,
}  from '@theseus/util'

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

/** @type {FCreatePublisher} */
export function createPublisher(producer, rqby = 'integration-test') {
    return (type, payload) => producer.publishCommand(createCommandEnvelope({
        cmd         : guid(),
        command_type: type,
        requested_by: rqby,
        payload,
    }))
}

/** @type {FCollectEvents} */
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

/**
 * @param {Evt[]} events
 * @param {string} etype
 * @param {Record<string, string|number|boolean>} query
 * @param {string|number} [ms]
 * @param {string|number} [delay]
 * @return {Evt}
 */// eslint-disable-next-line max-params
export function wherePayload(events, etype, query, ms, delay) {
    return wait(
        fq => events.find(e => e.event_type === etype && fq(e.payload)),
        ms,
        delay,
        A.pre(query),
    )
}

/**
 * @typedef { import('@theseus/contracts').AnyEventEnvelope   } Evt
 * @typedef { import('@theseus/contracts').AnyCommandEnvelope } Cmd
 * @typedef { import('../types/integration.js').collectEvents } FCollectEvents
 * @typedef { import('../types/integration.js').createPublisher } FCreatePublisher
 */
