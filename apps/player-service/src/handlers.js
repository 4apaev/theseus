/* eslint-disable camelcase */

import { Outbox          } from '@theseus/db'
import { guid, trim      } from '@theseus/util'
import { readEnv         } from '@theseus/config'
import { createEmitter   } from '@theseus/kafka'
import { STARTER_CREDITS } from '@theseus/domain'
import Crypt               from './crypto.js'
import {
    eventTree as EVT,
    commandTree as CMD,
} from '@theseus/contracts'

import {
    findPlayerByHandle,
    promoteToAdmin,
    insertPlayer,
    insertWallet,
    lockWallet,
    claimRfid,
    updateWallet,
} from './queries.js'

const emit = createEmitter('player-service')

// ADMIN_HANDLES is a list of handles, separated by commas.
// the code checks this list at every login.
// see the admin bootstrap section in docs/permissions.md.
function isAdmin(handle) {
    return readEnv('ADMIN_HANDLES', '').split(',').map(trim).includes(handle)
}

async function walletTx(client, evtp, { cmd: causation_id, correlation_id, payload: p }) {
    const { balance, version } = await updateWallet(
        evtp === EVT.wallet.debited
            ? '-'
            : '+',
        client,
        p.pid,
        p.amount,
    )

    await Outbox.write(client, [
        emit(evtp, {
            correlation_id,
            causation_id,
            aggregate_id     : p.pid,
            aggregate_type   : 'wallet',
            aggregate_version: version,
            payload          : { pid: p.pid, rfid: p.rfid, amount: p.amount, balance },
        }),
    ])
}

async function rejectWallet(client, wallet, { cmd: causation_id, correlation_id, payload: p }) {
    await Outbox.write(client, [
        emit(EVT.wallet.transaction.rejected, {
            correlation_id,
            causation_id,
            aggregate_id     : p.pid,
            aggregate_type   : 'wallet',
            aggregate_version: wallet?.version ?? 1,
            payload          : {
                pid   : p.pid,
                rfid  : p.rfid,
                amount: p.amount,
                reason: wallet ? 'insufficient funds' : 'wallet not found',
            },
        }),
    ])
}

// ─────────────────────────────────────────────────────────────

export function createHandlers(pool, transact, producer) {

    return {
        [ CMD.player.register.requested ]: registerPlayer,
        [ CMD.player.login.requested    ]: loginPlayer,
        [ CMD.wallet.debit.requested    ]: debitWallet,
        [ CMD.wallet.credit.requested   ]: creditWallet,
    }

    /*  login replies bypass the outbox on purpose - no domain write to
        keep atomic, and the gateway is waiting on the http request */
    async function loginPlayer({ cmd: causation_id, correlation_id, payload: p }) {
        const player = await findPlayerByHandle(pool, p.handle)
        const ok = !!player && await Crypt.verify(p.password, player.hash)

        // promote the player on a match.
        // do not demote the player.
        // an env change alone must not remove admin rights.
        if (ok && isAdmin(player.handle) && player.role !== 'admin') {
            await promoteToAdmin(pool, player.pid)
            player.role = 'admin'
        }

        await producer.publish(emit(
            ok ? EVT.player.login.succeeded : EVT.player.login.rejected,
            {
                correlation_id,
                causation_id,
                aggregate_id     : ok ? player.pid : p.handle,
                aggregate_type   : 'player',
                aggregate_version: 1,

                payload: ok
                    ? { pid: player.pid, handle: player.handle, role: player.role ?? 'player' }
                    : { handle: p.handle, reason: 'invalid credentials' },
            },
        ))
    }

    async function registerPlayer({ cmd: causation_id, correlation_id, payload: p }) {
        const pid  = guid()
        const hash = await Crypt.hash(p.password)

        try {
            await transact(pool, async client => {
                await insertPlayer(client, pid, p.handle, hash)
                await insertWallet(client, pid, STARTER_CREDITS)

                await Outbox.write(client, [

                    emit(EVT.player.created, {
                        correlation_id,
                        causation_id,
                        aggregate_id     : pid,
                        aggregate_type   : 'player',
                        aggregate_version: 1,

                        payload: { pid, handle: p.handle },
                    }),

                    emit(EVT.wallet.created, {
                        correlation_id,
                        causation_id,
                        aggregate_id     : pid,
                        aggregate_type   : 'wallet',
                        aggregate_version: 1,

                        payload: { pid, balance: STARTER_CREDITS },
                    }),
                ])
            })
        }
        catch (e) {
            if (e.code !== '23505') throw e /*
                            23505 - pg's unique violation on handle */

            await transact(pool, async client => {
                await Outbox.write(client, [
                    emit(EVT.player.registration.rejected, {
                        correlation_id,
                        causation_id,
                        aggregate_id     : p.handle,
                        aggregate_type   : 'player',
                        aggregate_version: 1,

                        payload: { handle: p.handle, reason: 'handle taken' },
                    }),
                ])
            })
        }
    }

    async function debitWallet(cmd) {
        await transact(pool, async client => {
            if (!await claimRfid(client, cmd.payload, 'debit')) return

            const wallet = await lockWallet(client, cmd.payload.pid)
            if (!wallet || wallet.balance < cmd.payload.amount)
                return rejectWallet(client, wallet, cmd)
            await walletTx(client, EVT.wallet.debited, cmd)
        })
    }

    async function creditWallet(cmd) {
        await transact(pool, async client => {
            if (!await claimRfid(client, cmd.payload, 'credit')) return
            await walletTx(client, EVT.wallet.credited, cmd)
        })
    }
}
