/* eslint-disable camelcase */

import { readEnv } from '@theseus/config'
import { Outbox  } from '@theseus/db'
import { guid    } from '@theseus/util'
import { createEmitter } from '@theseus/kafka'
import Crypt       from './crypto.js'
import {
    eventTree as EVT,
    commandTree as CMD,
} from '@theseus/contracts'

const STARTER_CREDITS = readEnv('STARTER_CREDITS', 1000)

const emit = createEmitter('player-service')

async function claimRfid(client, { pid, rfid, amount }, type) {
    const { rows } = await client.query(`
        insert into wallet_transactions (rfid, pid, amount, type)
            values ($1, $2, $3, $4)
            on conflict do nothing
            returning rfid
        `, [ rfid, pid, amount, type ],
    )
    return rows.length > 0
}

async function updateWallet(opr, client, pid, amount) {
    const rs = await client.query(`
        update wallets
           set balance = balance ${ opr } $2,
               version = version + 1
         where pid = $1
        returning balance, version
    `, [ pid, amount ])
    const row = rs.rows?.[ 0 ]
    return row ? { balance: +row.balance, version: row.version } : void 0
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
        const { rows: [ player ] } = await pool.query(
            'select pid, handle, hash from players where handle = $1',
            [ p.handle ],
        )

        const ok = !!player && await Crypt.verify(p.password, player.hash)

        await producer.publish(emit(
            ok ? EVT.player.login.succeeded : EVT.player.login.rejected,
            {
                correlation_id,
                causation_id,
                aggregate_id     : ok ? player.pid : p.handle,
                aggregate_type   : 'player',
                aggregate_version: 1,

                payload: ok
                    ? { pid: player.pid, handle: player.handle }
                    : { handle: p.handle, reason: 'invalid credentials' },
            },
        ))
    }

    async function registerPlayer({ cmd: causation_id, correlation_id, payload: p }) {
        const pid  = guid()
        const hash = await Crypt.hash(p.password)

        try {
            await transact(pool, async client => {
                await client.query('insert into players (pid, handle, hash) values ($1, $2, $3)', [ pid, p.handle, hash ])
                await client.query('insert into wallets (pid, balance)      values ($1, $2)'    , [ pid, STARTER_CREDITS ])

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

            const { rows: [ wallet ] } = await client.query(
                'select balance, version from wallets where pid = $1 for update',
                [ cmd.payload.pid ],
            )

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
