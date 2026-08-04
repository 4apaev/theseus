import { Outbox           } from '@theseus/db'
import { poll             } from '@theseus/util'
import { createEmitter    } from '@theseus/kafka'
import { eventTree as EVT } from '@theseus/contracts'

const emit = createEmitter('ship-service')

export function pollArrivals(pool, transact, { interval = 1000 } = {}) {
    return poll(arriveDue, interval, pool, transact)
}

function arriveDue(pool, transact) {
    return transact(pool, async client => {
        const { rows } = await client.query(`
            UPDATE ships
               SET status  = 'docked',
                   stid    = "to",
                   arrived = arrives,
                   updated = now()
             WHERE status = 'transit'
               AND arrives <= now()
            RETURNING sid, pid, stid, arrived, causation_id, correlation_id
        `)

        // arrived comes back as a Date - pool.js's oid 1114 parser, not a string;
        // the event schema requires isoTime
        rows.length && await Outbox.write(client, rows.map(ship => emit(EVT.ship.arrived, {
            correlation_id   : ship.correlation_id,
            causation_id     : ship.causation_id,
            aggregate_id     : ship.sid,
            aggregate_type   : 'ship',
            aggregate_version: 1,
            payload          : {
                sid: ship.sid,
                pid: ship.pid,
                stid: ship.stid,
                arrived: ship.arrived.toISOString(),
            },
        })))
        return rows.length
    })
}
