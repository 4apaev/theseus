/* eslint-disable camelcase */
import { Outbox           } from '@theseus/db'
import { poll             } from '@theseus/util'
import { createEmitter    } from '@theseus/kafka'
import { eventTree as EVT } from '@theseus/contracts'

import { travel } from './travel.js'

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
         RETURNING sid, pid, stid, arrived, velocity, manifest, causation_id, correlation_id
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

        await advanceManifest(client, rows.filter(ship => ship.manifest.length))
        return rows.length
    })
}

// a ship on a manifest doesn't stay docked - the stop it just made was
// only a waypoint. re-depart it toward the next hop, same as a fresh
// travel request would, one hop at a time.
async function advanceManifest(client, ships) {
    for (const ship of ships) {
        const [ to, ...manifest ] = ship.manifest
        const { arrives, years_abs, years_rel } = travel(ship.stid, to, ship.velocity)
        const departed = (new Date).toISOString()

        await client.query(`
            UPDATE ships
               SET status   = 'transit',
                   "from"   = $2,
                   "to"     = $3,
                   departs  = $4,
                   arrives  = $5,
                   manifest = $6,
                   updated  = now()
             WHERE sid = $1
        `, [ ship.sid, ship.stid, to, departed, arrives, manifest ])

        await Outbox.write(client, [ emit(EVT.ship.departed, {
            causation_id     : ship.causation_id,
            correlation_id   : ship.correlation_id,
            aggregate_id     : ship.sid,
            aggregate_type   : 'ship',
            aggregate_version: 1,
            payload          : {
                sid : ship.sid,
                pid : ship.pid,
                from: ship.stid,
                to,
                departed,
                arrives,
                years_abs,
                years_rel,
            },
        }) ])
    }
}
