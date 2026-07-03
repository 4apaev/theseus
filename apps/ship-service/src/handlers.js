/* eslint-disable camelcase */
import Crypto from 'node:crypto'

import { Outbox } from '@theseus/db'
import {
    eventKey,
    eventTopic,
    createEventEnvelope,
    eventTree   as EVT,
    commandTree as CMD,
} from '@theseus/contracts'

import { travel } from './travel.js'

const PRODUCER = 'ship-service'

function emit(evtp, e) {
    return createEventEnvelope({
        eid              : Crypto.randomUUID(),
        event_type       : evtp,
        aggregate_id     : e.aggregate_id,
        aggregate_type   : e.aggregate_type,
        aggregate_version: e.aggregate_version ?? 1,
        causation_id     : e.causation_id,
        correlation_id   : e.correlation_id,
        payload          : e.payload,
        producer         : PRODUCER,
    })
}

function toRecord(envelope) {
    return {
        topic   : eventTopic(envelope.event_type),
        messages: [{
            key  : eventKey(envelope),
            value: envelope,
        }],
    }
}

// ─────────────────────────────────────────────────────────────

export function createHandlers(pool, transact) {
    return {
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
                    toRecord(emit(EVT.ship.departed, {
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
                    })),
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
            toRecord(emit(EVT.ship.arrived, {
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
            })),
        ])
    })
}

async function reject(client, { reason, causation_id, correlation_id, p }) {
    await Outbox.write(client, [
        toRecord(emit(EVT.ship.travel.rejected, {
            causation_id,
            correlation_id,
            aggregate_id     : p.sid,
            aggregate_type   : 'ship',
            aggregate_version: 1,
            payload          : { sid: p.sid, pid: p.pid, reason },
        })),
    ])
}
