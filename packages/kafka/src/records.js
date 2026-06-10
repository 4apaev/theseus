import { encodeJson } from './serde.js'

export function createTopicRecord(input) {
    return {
        topic   : input.topic,
        messages: [
            {
                key  : input.key,
                value: encodeJson(input.value),
            },
        ],
    }
}
