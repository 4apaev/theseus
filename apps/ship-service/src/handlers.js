/* eslint-disable camelcase */
import { Outbox } from '@theseus/db'
import { createEmitter } from '@theseus/kafka'
import { makeId, starterShip } from '@theseus/domain'
import {
    eventTree   as EVT,
    commandTree as CMD,
} from '@theseus/contracts'

import { travel } from './travel.js'

const emit = createEmitter('ship-service')

// ─────────────────────────────────────────────────────────────

export function createHandlers(pool, transact) {
    return {
        // saga: every new player gets the starter ship, docked at sol.outpost
        async [ EVT.player.created ]({ eid: causation_id, correlation_id, payload: p }) {
            const sid = makeId('ship')

            await transact(pool, async client => {
                await client.query(`
                    insert into ships (sid, pid, stid, name, capacity, velocity)
                    values ($1, $2, $3, $4, $5, $6)
                `, [ sid, p.pid, starterShip.stid, starterShip.name, starterShip.capacity, starterShip.velocity ])

                await Outbox.write(client, [
                    emit(EVT.ship.created, {
                        causation_id,
                        correlation_id,
                        aggregate_id     : sid,
                        aggregate_type   : 'ship',
                        aggregate_version: 1,
                        payload          : {
                            sid,
                            pid     : p.pid,
                            stid    : starterShip.stid,
                            name    : starterShip.name,
                            capacity: starterShip.capacity,
                            velocity: starterShip.velocity,
                        },
                    }),
                ])
            })
        },

        async [ CMD.ship.travel.requested ]({ cmd: causation_id, correlation_id, payload: p }) {
            const trip = await transact(pool, async client => {

                const { rows: [ ship ] } = await client.query('select * from ships where sid = $1', [ p.sid ])

                if (!ship)                    return reject(client, { reason: 'ship not found'                     , causation_id, correlation_id, p })
                if (ship.status !== 'docked') return reject(client, { reason: 'ship not docked'                    , causation_id, correlation_id, p })
                if (ship.stid !== p.from)     return reject(client, { reason: 'ship not at origin'                 , causation_id, correlation_id, p })
                if (p.from === p.to)          return reject(client, { reason: 'origin and destination are the same', causation_id, correlation_id, p })

                const {
                    ms,
                    arrives,
                    years_abs,
                    years_rel,
                } = travel(
                    p.from,
                    p.to,
                    ship.velocity,
                )

                const departed = (new Date).toISOString()

                await client.query(`
                update ships
                   set status  = 'transit',
                       "from"  = $2,
                       "to"    = $3,
                       departs = $4,
                       arrives = $5,
                       updated = now()
                 where sid = $1
            `, [ p.sid, p.from, p.to, departed, arrives ])

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
                            to  : p.to,
                            departed,
                            arrives,
                            years_abs,
                            years_rel,
                        },
                    }),
                ])
                return { ms, ship, to: p.to, arrives }
            })

            // schedule only after the transaction commits - a rollback must not dock the ship
            trip && setTimeout(arrive, trip.ms, pool, transact, { causation_id, correlation_id, ...trip })
        },
    }
}

async function arrive(pool, transact, { ship, arrives, to, ...data }) {
    await transact(pool, async client => {
        await client.query(`
            update ships
               set status  = 'docked',
                   stid    = $2,
                   arrived = $3,
                   updated = now()
             where sid = $1
        `, [ ship.sid, to, arrives ])

        await Outbox.write(client, [
            emit(EVT.ship.arrived, {
                causation_id     : data.causation_id,
                correlation_id   : data.correlation_id,
                aggregate_id     : ship.sid,
                aggregate_type   : 'ship',
                aggregate_version: 1,
                payload          : {
                    sid    : ship.sid,
                    pid    : ship.pid,
                    stid   : to,
                    arrived: arrives,
                },
            }),
        ])
    })
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
