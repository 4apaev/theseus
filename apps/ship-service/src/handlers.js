/* eslint-disable camelcase */
import { Outbox } from '@theseus/db'
import { guid } from '@theseus/util'
import { createEmitter, createCommander } from '@theseus/kafka'
import {
    starterShip,
    universe,
    hulls,
    starterRig,
    deriveStats,
    previewRig,
} from '@theseus/domain'
import {
    eventTree   as EVT,
    commandTree as CMD,
} from '@theseus/contracts'

import { travel } from './travel.js'
import {
    renameShip,
    insertShip,
    getShip,
    lockShip,
    updateShipRig,
    updateShipDeparture,
    getFittedModules,
    setFittedModules,
    hasPendingOperation,
    insertOperation,
    lockOperation,
    completeOperation,
    rejectOperation,
} from './queries.js'

const emit    = createEmitter('ship-service')
const command = createCommander('ship-service')

const a2o = ([ slot, gid ]) => ({ slot, gid })
/*
    every new ship gets the starter hull and its default rig - there is
    no per-ship hull choice yet (that's step 4's persistence work), so
    this is one constant snapshot, not a per-ship lookup. `fitted` goes
    on the wire as an array (slot ids aren't a fixed field set, so a
    plain object can't be validated generically) - see docs/modules.md.
*/
const starterHull  = hulls.starter
const starterStats = deriveStats(starterHull, starterRig)
const starterFitted = Object.entries(starterRig).map(a2o)
// ─────────────────────────────────────────────────────────────

export function createHandlers(pool, transact) {
    return {
        [ EVT.player.created                 ]: playerCreated,
        [ CMD.ship.travel.requested          ]: shipTravelRequested,
        [ CMD.ship.rename.requested          ]: shipRenameRequested,
        [ CMD.ship.module.install.requested  ]: shipModuleInstallRequested,
        [ CMD.ship.module.remove.requested   ]: shipModuleRemoveRequested,
        [ EVT.cargo.module.exchanged         ]: cargoModuleExchanged,
        [ EVT.cargo.module.exchange.rejected ]: cargoModuleExchangeRejected,
    }

    /*  a player renames their own ship. the pid comes from the token, so
        a foreign sid finds no row and the command is rejected.
        the name is already checked by the contract. */
    async function shipRenameRequested({ cmd: causation_id, correlation_id, payload: p }) {
        await transact(pool, async client => {
            const ship = await renameShip(client, p.sid, p.pid, p.name)

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
            await insertShip(client, {
                sid, pid, stid, name,
                capacity, velocity,
                rig: 1, hull: starterHull.id,

            })
            await setFittedModules(client, sid, starterRig)

            await Outbox.write(client, [
                emit(EVT.ship.created, {
                    causation_id,
                    correlation_id,
                    aggregate_id     : sid,
                    aggregate_type   : 'ship',
                    aggregate_version: 1,
                    payload          : {
                        sid, pid, stid, name, capacity, velocity,
                        hull      : starterHull.id,
                        rig       : 1,
                        fitted    : starterFitted,
                        power     : starterStats.power.used,
                        power_pool: starterStats.power.available,
                    },
                }),
            ])
        })
    }

    async function shipTravelRequested({ cmd: causation_id, correlation_id, payload: p }) {
        await transact(pool, async client => {

            const ship = await getShip(client, p.sid)

            if (!ship)                    return reject(client, { reason: 'ship not found'                     , causation_id, correlation_id, p })
            if (ship.status !== 'docked') return reject(client, { reason: 'ship not docked'                    , causation_id, correlation_id, p })
            if (ship.stid !== p.from)     return reject(client, { reason: 'ship not at origin'                 , causation_id, correlation_id, p })
            if (p.from === p.to)          return reject(client, { reason: 'origin and destination are the same', causation_id, correlation_id, p })
            if (await hasPendingOperation(client, p.sid))
                return reject(client, { reason: 'refit pending', causation_id, correlation_id, p })

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

            await updateShipDeparture(client, p.sid, {
                from: p.from, to, departed, arrives, manifest, causation_id, correlation_id,
            })

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

    // ── module fitting saga ──────────────────────────────────────
    // install and remove share every step but the resolver operation
    // they build - see docs/modules.md's "ship-service fitting saga"

    async function shipModuleInstallRequested({ cmd, correlation_id, payload }) {
        await fitModule(cmd, correlation_id, payload, {
            type: 'install',
            slot: payload.slot,
            gid: payload.gid,
        })
    }

    async function shipModuleRemoveRequested({ cmd, correlation_id, payload }) {
        await fitModule(cmd, correlation_id, payload, {
            type: 'remove',
            slot: payload.slot,
        })
    }

    // the install/remove handler - shared by both commands,
    // they differ only in the resolver operation they build
    async function fitModule(causation_id, correlation_id, p, opr) {
        await transact(pool, async client => {
            const oid = guid('refit')
            const reject = reasons => rejectFit(client, {
                causation_id,
                correlation_id,
                pid: p.pid,
                sid: p.sid,
                oid, reasons,
            })

            const ship = await lockShip(client, p.sid)
            if (!ship)                                    return reject([ 'ship not found' ])
            if (await hasPendingOperation(client, p.sid)) return reject([ 'refit pending' ])

            const fitted   = await getFittedModules(client, p.sid)
            const ctx      = { docked: ship.status === 'docked' }
            const hull     = hulls[ ship.hull ]
            const outgoing = fitted[ opr.slot ]

            const { proposed, stats, errors } = previewRig(hull, fitted, opr, ctx)
            if (errors.length) return reject(errors)

            const incoming = opr.type === 'install'
                ? opr.gid
                : void 0

            await insertOperation(client, {
                oid,
                pid: p.pid,
                sid: p.sid,
                slot: opr.slot,
                type: opr.type,
                stats,
                incoming,
                outgoing,
                proposed,
                causation_id,
                correlation_id,
            })

            await Outbox.write(client, [
                command(CMD.cargo.module.exchange.requested, {
                    correlation_id,
                    payload: {
                        pid: p.pid,
                        sid: p.sid,
                        operation: oid,
                        incoming,
                        outgoing,
                        capacity_next: stats.capacity,
                    },
                }),
            ])
        })
    }

    // ── cargo exchange continuation, from events.cargo ───────────
    // duplicate or late replies are no-ops once the operation is
    // already done or rejected - lockOperation makes that check safe
    async function cargoModuleExchanged({ eid, correlation_id, payload: p }) {
        await transact(pool, async client => {

            const opr = await lockOperation(client, p.operation)
            if (opr?.status !== 'pending') return

            await setFittedModules(client, opr.sid, opr.proposed)

            const ship = await updateShipRig(client, opr.sid, opr.stats)
            await completeOperation(client, opr.oid)

            await Outbox.write(client, [
                emit(EVT.ship.rig.changed, {
                    correlation_id,
                    causation_id     : eid,
                    aggregate_id     : opr.sid,
                    aggregate_type   : 'ship',
                    aggregate_version: ship.rig,
                    payload          : {
                        pid       : opr.pid,
                        sid       : opr.sid,
                        slot      : opr.slot,
                        fitted    : Object.entries(opr.proposed).map(a2o),
                        capacity  : ship.capacity,
                        velocity  : Number(ship.velocity), // pg numeric comes back as a string
                        hull      : ship.hull,
                        rig       : ship.rig,
                        operation : opr.oid,
                        incoming  : opr.incoming,
                        outgoing  : opr.outgoing,
                        power     : opr.stats.power.used,
                        power_pool: opr.stats.power.available,
                    },
                }),
            ])
        })
    }

    async function cargoModuleExchangeRejected({ eid: causation_id, correlation_id, payload }) {
        await transact(pool, async client => {
            const opr = await lockOperation(client, payload.operation)
            if (opr?.status !== 'pending') return

            await rejectOperation(client, opr.oid)
            await rejectFit(client, {
                causation_id,
                correlation_id,
                pid: opr.pid,
                sid: opr.sid,
                oid: opr.oid,
                reasons: payload.reasons,
            })
        })
    }
}

async function rejectFit(client, { causation_id, correlation_id, pid, sid, oid, reasons }) {
    await Outbox.write(client, [
        emit(EVT.ship.module.operation.rejected, {
            causation_id,
            correlation_id,
            aggregate_id     : sid,
            aggregate_type   : 'ship',
            aggregate_version: 1,
            payload          : { pid, sid, operation: oid, reasons },
        }),
    ])
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
