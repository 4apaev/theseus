import { randomUUID } from 'node:crypto'
import {
    poll,
    Codec,
    withClient,
} from '@theseus/util'

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
    return poll(
        () => withClient(db, async client => {
            const rows = await fetchPending(client, batch)

            for (const row of rows) {
                await publish(toRecord(row))
                await markPublished(client, row.id)
            }
        }),
        interval,
    )
}

function insertOutboxRow(client, topic, key, value) {
    const payload = Buffer.isBuffer(value) ? Codec.decode(value) : value
    return client.query(
        'insert into outbox (id, topic, key, payload) values ($1, $2, $3, $4)',
        [ randomUUID(), topic, key ?? null, JSON.stringify(payload) ],
    )
}

function fetchPending(client, batch) {
    return client.query(
        `select id, topic, key, payload
         from outbox
         where published is null
         order by created
         limit $1`,
        [ batch ],
    ).then(r => r.rows)
}

function markPublished(client, id) {
    return client.query(
        'update outbox set published = now() where id = $1',
        [ id ],
    )
}

function toRecord({ key, topic, payload }) {
    return {
        topic,
        messages: [{ key, value: Codec.encode(payload) }],
    }
}
