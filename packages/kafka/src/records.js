import { randomUUID } from 'node:crypto'

import {
    eventKey,
    eventTopic,
    eventTopics,
    validateEvent,
    validateCommand,
    commandTopic,
    commandKey,
    createEventEnvelope,
} from '@theseus/contracts'

import { Codec } from '@theseus/util'

export function createTopicRecord({ key, topic, value }) {
    return {
        topic,
        messages: [{
            key,
            value: Codec.encode(value),
        }],
    }
}

export function createCommandRecord(cmd) {
    validateCommand(cmd)

    return createTopicRecord({
        key  : commandKey(cmd),
        topic: commandTopic(cmd.command_type),
        value: cmd,
    })
}

export function createEventRecords(e, opt = {}) {
    validateEvent(e)

    const records = [
        createTopicRecord({
            key  : eventKey(e),
            topic: eventTopic(e.event_type),
            value: e,
        }),
    ]

    if (opt.includeAll) {
        records.push(createTopicRecord({
            key  : e.aggregate_id,
            topic: eventTopics.all,
            value: e,
        }))
    }

    return records
}

// service-side event factory: fills eid / producer / version defaults,
// validates, and returns an outbox-ready topic record
export function createEmitter(producer) {
    return (etype, e) => createEventRecords(createEventEnvelope({
        eid              : randomUUID(),
        producer,
        event_type       : etype,
        aggregate_version: e.aggregate_version ?? 1,
        ...e,
    }))[ 0 ]
}

export function decodeTopicMessage({
    key,
    topic,
    value,
    offset,
    partition,
}) {
    return {
        key,
        offset,
        partition,
        topic,
        value: Codec.decode(value),
    }
}
