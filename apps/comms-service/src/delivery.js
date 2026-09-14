import { EVT } from '@theseus/contracts'
import { poll } from '@theseus/util'
import { Outbox } from '@theseus/db'
import { createEmitter } from '@theseus/kafka'
import { updateMessages } from './queries.js'

const emit = createEmitter('comms-service')

/**
 * @description
 *     the ansible's delivery poll.
 *     it uses the same shape as ship-service's `pollArrivals`.
 *     station chat delivers at send time,
 *     so it never reaches this poll.
 *
 * @param {import('pg').Pool} pool
 * @param {Function} transact
 * @param {{ interval?: number|string }} [opt]
 */
export default function pollDelivery(pool, transact, { interval = 1000 } = {}) {
    return poll(transact, interval, pool, deliverDue)
}

async function deliverDue(client) {
    const rows = await updateMessages(client)
    rows.length && await Outbox.write(client, rows.map(m => emit(EVT.message.delivered, {
        aggregate_id  : m.mid,
        aggregate_type: 'comms',
        payload       : {
            mid      : m.mid,
            from     : m.from,
            to       : m.to,
            body     : m.body,
            delivered: m.delivered.toISOString(), // delivered comes back as a Date
        },
    })))
    return rows.length
}
