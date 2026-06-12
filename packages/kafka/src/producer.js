import {
    createCommandRecord,
    createEventRecords,
} from './records.js'

export function createProducer(input) {
    const includeAll = input.publishAllEvents ?? false

    const publish = rec => input.client.publish(rec)

    return {
        publish,
        publishCommand(cmd) {
            return publish(createCommandRecord(cmd))
        },
        publishEvent(e) {
            const recs = createEventRecords(e, { includeAll })
            const pubs = recs.map(publish)
            return Promise.all(pubs)
        },
    }
}
