/* eslint-disable camelcase */

import Crypto from 'node:crypto'

import { readEnv } from '@theseus/config'
import { Outbox  } from '@theseus/db'
import Crypt       from './crypto.js'
import {
    eventKey,
    eventTopic,
    eventTypes as ET,
    commandTypes as CT,
    createEventEnvelope,
} from '@theseus/contracts'

const PRODUCER        = 'player-service'
const STARTER_CREDITS = readEnv('STARTER_CREDITS', 1000)

/*

    player/src/
        handlers

    kafka/src/
        records

    contracts/src/
        envelope
        events

        types/
            envelope
            events
    test/
        kafka.spec
        contracts.spec

    event_type          evtp
    aggregate_type      agtp
    aggregate_id        agid
    aggregate_version   aggv
    causation_id        caid cause
    correlation_id      coid crid
*/

function emit(evtp, {
    aggregate_type,
    aggregate_id,
    aggregate_version,
    causation_id,
    correlation_id,
    payload,
}) {
    return createEventEnvelope({
        eid       : Crypto.randomUUID(),
        event_type: evtp,
        aggregate_id,
        aggregate_type,
        aggregate_version,
        correlation_id,
        causation_id,
        producer  : PRODUCER,
        payload,
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

async function updateWallet(opr, client, pid, amount) {
    const rs = await client.query(`
        update wallets
           set balance = balance ${ opr } $2,
               version = version + 1
         where pid = $1
        returning balance, version
    `, [ pid, amount ])
    return rs.rows?.[ 0 ]
}

async function walletTx(client, evtp, { cmd: causation_id, correlation_id, payload: p }) {
    const { balance, version } = await updateWallet(
        evtp === ET.wallet_debited_v1
            ? '-'
            : '+',
        client,
        p.pid,
        p.amount,
    )

    await Outbox.write(client, [
        toRecord(emit(evtp, {
            correlation_id,
            causation_id,
            aggregate_id     : p.pid,
            aggregate_type   : 'wallet',
            aggregate_version: version,
            payload          : { pid: p.pid, rfid: p.rfid, amount: p.amount, balance },
        })),
    ])
}

async function rejectWallet(client, wallet, { cmd: causation_id, correlation_id, payload: p }) {
    await Outbox.write(client, [
        toRecord(emit(ET.wallet_transaction_rejected_v1, {
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
        })),
    ])
}

// ─────────────────────────────────────────────────────────────

export function createHandlers(pool, transact) {

    return {
        [ CT.player_register_requested_v1 ]: registerPlayer,
        [ CT.wallet_debit_requested_v1    ]: debitWallet,
        [ CT.wallet_credit_requested_v1   ]: creditWallet,
    }

    async function registerPlayer({ cmd: causation_id, correlation_id, payload: p }) {
        const pid  = Crypto.randomUUID()
        const hash = await Crypt.hash(p.password)

        try {
            await transact(pool, async client => {
                await client.query('insert into players (pid, handle, hash) values ($1, $2, $3)', [ pid, p.handle, hash ])
                await client.query('insert into wallets (pid, balance)      values ($1, $2)'    , [ pid, STARTER_CREDITS ])

                await Outbox.write(client, [

                    toRecord(emit(ET.player_created_v1, {
                        correlation_id,
                        causation_id,
                        aggregate_id     : pid,
                        aggregate_type   : 'player',
                        aggregate_version: 1,

                        payload: { pid, handle: p.handle },
                    })),

                    toRecord(emit(ET.wallet_created_v1, {
                        correlation_id,
                        causation_id,
                        aggregate_id     : pid,
                        aggregate_type   : 'wallet',
                        aggregate_version: 1,

                        payload: { pid, balance: STARTER_CREDITS },
                    })),
                ])
            })
        }
        catch (e) {
            if (e.code !== '23505') throw e /*
                            23505 - pg's unique violation on handle */

            await transact(pool, async client => {
                await Outbox.write(client, [
                    toRecord(emit(ET.player_registration_rejected_v1, {
                        correlation_id,
                        causation_id,
                        aggregate_id     : p.handle,
                        aggregate_type   : 'player',
                        aggregate_version: 1,

                        payload: { handle: p.handle, reason: 'handle taken' },
                    })),
                ])
            })
        }
    }

    async function debitWallet(cmd) {
        await transact(pool, async client => {
            const { rows: [ wallet ] } = await client.query(
                'select balance, version from wallets where pid = $1 for update',
                [ cmd.payload.pid ],
            )

            if (!wallet || wallet.balance < cmd.payload.amount)
                return rejectWallet(client, wallet, cmd)
            await walletTx(client, ET.wallet_debited_v1, cmd)
        })
    }

    async function creditWallet(cmd) {
        await transact(pool, async client => {
            await walletTx(client, ET.wallet_credited_v1, cmd)
        })
    }
}
