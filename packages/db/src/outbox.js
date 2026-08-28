import {
    guid,
    poll,
    Codec,
} from '@theseus/util'

import { withClient } from './query.js'

export default {
    write: writeOutbox,
    poll : pollOutbox,
}

export async function writeOutbox(client, records) {
    for (const { topic, messages } of records) {
        for (const { key, value } of messages)
            await insertOutboxRow(client, topic, key, value)
    }
}

export function pollOutbox(db, publish, { interval = 1000, batch = 10 } = {}) {
    return poll(withClient, interval, db, async client => {
        for (const row of await fetchPending(client, batch)) {
            await publish(toRecord(row))
            await markPublished(client, row.id)
        }
    })
}

function insertOutboxRow(client, topic, key, value) {
    const payload = JSON.stringify(
        Buffer.isBuffer(value)
            ? Codec.decode(value)
            : value)

    return client.query(`
        INSERT INTO outbox (id, topic, key, payload)
             VALUES ($1, $2, $3, $4)`, [
        guid(), topic, key ?? null, payload ],
    )
}

function fetchPending(client, batch) {
    return client.query(`
        SELECT id, topic, key, payload
          FROM outbox
         WHERE published IS NULL
         ORDER BY created
         LIMIT $1
    `, [ batch ]).then(r => r.rows)
}

function markPublished(client, id) {
    return client.query(`
        UPDATE outbox
           SET published = now()
         WHERE id = $1
        `, [ id ])
}

function toRecord({ key, topic, payload }) {
    return {
        topic,
        messages: [{ key, value: Codec.encode(payload) }],
    }
}
