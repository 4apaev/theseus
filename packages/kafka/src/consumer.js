import Store from './idempotency.js'

import { decodeTopicMessage } from './records.js'

export function createConsumer(input) {
    const store = input.store ?? new Store
    const stats = {
        duplicates: 0,
        handled   : 0,
    }

    const sub = input.client.subscribe({
        groupId: input.groupId,
        topics : input.topics,
        handler: record => consumeRecord({
            handler: input.handler,
            record,
            stats,
            store,
        }),
    })

    return {
        stats() { return { ...stats } },
        stop() { sub.stop() },
    }
}

async function consumeRecord(input) {
    const msg = decodeTopicMessage(input.record)
    const id = Store.identity(msg.value)

    if (id && input.store.has(id)) {
        input.stats.duplicates += 1
        return { id, message: msg, status: 'duplicate' }
    }

    await input.handler(msg)

    id && input.store.mark(id)
    input.stats.handled += 1

    return { id, message: msg, status: 'handled' }
}
