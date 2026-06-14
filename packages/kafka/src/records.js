import {
    eventKey,
    eventTopic,
    eventTopics,
    validateEvent,
    validateCommand,
    commandTopic,
    commandKey,
} from '@theseus/contracts'

import Codec from './codec.js'

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
