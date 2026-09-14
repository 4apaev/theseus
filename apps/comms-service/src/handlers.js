/* eslint-disable camelcase */
import { Outbox        } from '@theseus/db'
import { guid          } from '@theseus/util'
import { createEmitter } from '@theseus/kafka'

import { EVT, CMD } from '@theseus/contracts'
import {
    universe,
    TIME_SCALE,
    ANSIBLE_SPEED,
} from '@theseus/domain'

import {
    shipByPid,
    shipArrived,
    shipDeparted,
    shipRigChanged,
    insertShip,
    insertMessage,
} from './queries.js'

const emit = createEmitter('comms-service')

/**
 * @description
 *   the ships mirror, from events.ship. pure and idempotent.
 *   it writes nothing to the outbox and causes no side effects.
 *   comms-service needs only 2 facts: where a ship is docked,
 *   and whether it carries a transceiver.
 *
 * @param { import('@theseus/db').Pool } pool
 */
export function shipMirrorHandlers(pool) {
    return {
        [ EVT.ship.created     ]({ payload }) { return insertShip(pool, payload) },
        [ EVT.ship.departed    ]({ payload }) { return shipDeparted(pool, payload) },
        [ EVT.ship.arrived     ]({ payload }) { return shipArrived(pool, payload) },
        [ EVT.ship.rig.changed ]({ payload }) { return shipRigChanged(pool, payload) },
    }
}

export default createHandlers
export function createHandlers(pool, transact) {
    return {
        ...shipMirrorHandlers(pool),
        [ CMD.comms.send.requested ]: messageSendRequested,
    }

    async function messageSendRequested({ cmd: causation_id, correlation_id, payload }) {
        const { pid, to, body } = payload

        await transact(pool, async client => {
            const reject = r => rejectSend(client, { causation_id, correlation_id, pid, reason: r })

            if (to === pid)
                return reject('cannot message yourself')

            const sender = await shipByPid(client, pid)
            if (!sender) return reject('ship unknown')

            return to
                ? sendAnsible(client,     { reject, causation_id, correlation_id, body, sender, to })
                : sendStationChat(client, { reject, causation_id, correlation_id, body, sender })
        })
    }

    // ── station chat - instant, no delay to wait out ──────────────
    async function sendStationChat(client, { causation_id, correlation_id, sender, body, reject }) {
        if (!sender.stid) return reject('not docked anywhere')

        const mid  = guid('msg')
        const sent = (new Date).toISOString()
        const payload = {
            mid, body, sent,
            deliver: sent,
            stid: sender.stid,
            from: sender.pid,
        }

        await insertMessage(client, { ...payload, to: void 0, delivered: sent })

        await Outbox.write(client, [
            emit(EVT.message.sent, {
                causation_id,
                correlation_id,
                aggregate_id  : mid,
                aggregate_type: 'comms',
                payload,
            }),
        ])
    }

    // ── the ansible message ──────────────────────────────────────

    async function sendAnsible(client, { causation_id, correlation_id, sender, to, body, reject }) {
        const recipient = await shipByPid(client, to)

        if (!recipient)             return reject('unknown recipient')
        if (!sender.has_ansible)    return reject('no ansible fitted')
        if (!recipient.has_ansible) return reject('recipient has no ansible fitted')

        /*
            are they?
            whats the point of having ship fitted ansible then?
        */
        // both ships must dock first.
        if (!sender.stid)    return reject('cannot send while in transit')
        if (!recipient.stid) return reject('recipient is in transit')

        const mid = guid('msg')
        const ms  = ansibleDelay(sender.stid, recipient.stid)
        const now = Date.now()

        const payload = {
            mid, body, to,
            from: sender.pid,
            sent: new Date(now).toISOString(),
            deliver: new Date(now + ms).toISOString(),
        }
        await insertMessage(client, { ...payload, stid: void 0, delivered: void 0 })

        await Outbox.write(client, [
            emit(EVT.message.sent, {
                causation_id,
                correlation_id,
                aggregate_id  : mid,
                aggregate_type: 'comms',
                payload,
            }),
        ])
    }
}

function rejectSend(client, { causation_id, correlation_id, pid, reason }) {
    return Outbox.write(client, [
        emit(EVT.message.send.rejected, {
            causation_id,
            correlation_id,
            aggregate_id  : pid,
            aggregate_type: 'comms',
            payload       : { pid, reason },
        }),
    ])
}

function ansibleDelay(src, dist) {
    const ly  = src === dist ? 0 : universe.distanceTo(src, dist)
    return ly / ANSIBLE_SPEED * TIME_SCALE * 1000
}
