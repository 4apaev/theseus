/* eslint-disable camelcase */
import { Outbox } from '@theseus/db'
import { guid } from '@theseus/util'
import { createEmitter } from '@theseus/kafka'
import { starterShip, universe } from '@theseus/domain'
import {
    eventTree   as EVT,
    commandTree as CMD,
} from '@theseus/contracts'

import { travel } from './travel.js'

const emit = createEmitter('ship-service')

// ─────────────────────────────────────────────────────────────

export function createHandlers(pool, transact) {
    return {
        [ EVT.player.created        ]: playerCreated,
        [ CMD.ship.travel.requested ]: shipTravelRequested,
        [ CMD.ship.rename.requested ]: shipRenameRequested,
    }

    /*  a player renames their own ship. the pid comes from the token, so
        a foreign sid finds no row and the command is rejected.
        the name is already checked by the contract. */
    async function shipRenameRequested({ cmd: causation_id, correlation_id, payload: p }) {
        await transact(pool, async client => {
            const { rows: [ ship ] } = await client.query(`
                UPDATE ships
                   SET name = $3, updated = now()
                 WHERE sid = $1
                   AND pid = $2
             RETURNING sid, pid, name
            `, [ p.sid, p.pid, p.name ])

            if (!ship)
                return rejectRename(client, { reason: 'ship not found', causation_id, correlation_id, p })

            await Outbox.write(client, [
                emit(EVT.ship.renamed, {
                    causation_id,
                    correlation_id,
                    aggregate_id     : ship.sid,
                    aggregate_type   : 'ship',
                    aggregate_version: 1,
                    payload          : { sid: ship.sid, pid: ship.pid, name: ship.name },
                }),
            ])
        })
    }

    // saga: every new player gets the starter ship, docked at sol.outpost
    async function playerCreated({ eid: causation_id, correlation_id, payload: { pid }}) {
        const sid = guid('ship')
        const { stid, name, velocity, capacity } = starterShip // random name getter, read it once by destructing

        await transact(pool, async client => {
            await client.query(`
                insert into ships (sid, pid, stid, name, capacity, velocity)
                values ($1, $2, $3, $4, $5, $6)
            `, [ sid, pid, stid, name, capacity, velocity ])

            await Outbox.write(client, [
                emit(EVT.ship.created, {
                    causation_id,
                    correlation_id,
                    aggregate_id     : sid,
                    aggregate_type   : 'ship',
                    aggregate_version: 1,
                    payload          : { sid, pid, stid, name, capacity, velocity },
                }),
            ])
        })
    }

    async function shipTravelRequested({ cmd: causation_id, correlation_id, payload: p }) {
        await transact(pool, async client => {

            const { rows: [ ship ] } = await client.query('select * from ships where sid = $1', [ p.sid ])

            if (!ship)                    return reject(client, { reason: 'ship not found'                     , causation_id, correlation_id, p })
            if (ship.status !== 'docked') return reject(client, { reason: 'ship not docked'                    , causation_id, correlation_id, p })
            if (ship.stid !== p.from)     return reject(client, { reason: 'ship not at origin'                 , causation_id, correlation_id, p })
            if (p.from === p.to)          return reject(client, { reason: 'origin and destination are the same', causation_id, correlation_id, p })

            // pg numeric comes back as a string - path() checks the
            // type strictly, unlike travel()'s bare arithmetic
            const velocity = Number(ship.velocity)

            // p.to is the final destination - it need not be a direct
            // neighbor. path() resolves the full hop sequence; the
            // hops after the first go on `manifest` and get consumed
            // one at a time by arrivals.js.
            const stops = universe.path(p.from, p.to, velocity)
            if (!stops) return reject(client, { reason: 'no route to destination', causation_id, correlation_id, p })

            const [ , to, ...manifest ] = stops
            const { arrives, years_abs, years_rel } = travel(p.from, to, velocity)

            const departed = (new Date).toISOString()

            await client.query(`
            update ships
               set status         = 'transit',
                   "from"         = $2,
                   "to"           = $3,
                   departs        = $4,
                   arrives        = $5,
                   manifest       = $6,
                   causation_id   = $7,
                   correlation_id = $8,
                   updated        = now()
             where sid = $1
        `, [ p.sid, p.from, to, departed, arrives, manifest, causation_id, correlation_id ])

            await Outbox.write(client, [
                emit(EVT.ship.departed, {
                    causation_id,
                    correlation_id,
                    aggregate_id     : p.sid,
                    aggregate_type   : 'ship',
                    aggregate_version: 1,
                    payload          : {
                        sid : p.sid,
                        pid : p.pid,
                        from: p.from,
                        to,
                        departed,
                        arrives,
                        years_abs,
                        years_rel,
                    },
                }),
            ])
        })
    }
}

async function rejectRename(client, { reason, causation_id, correlation_id, p }) {
    await Outbox.write(client, [
        emit(EVT.ship.rename.rejected, {
            causation_id,
            correlation_id,
            aggregate_id     : p.sid,
            aggregate_type   : 'ship',
            aggregate_version: 1,
            payload          : { sid: p.sid, pid: p.pid, reason },
        }),
    ])
}

async function reject(client, { reason, causation_id, correlation_id, p }) {
    await Outbox.write(client, [
        emit(EVT.ship.travel.rejected, {
            causation_id,
            correlation_id,
            aggregate_id     : p.sid,
            aggregate_type   : 'ship',
            aggregate_version: 1,
            payload          : { sid: p.sid, pid: p.pid, reason },
        }),
    ])
}
