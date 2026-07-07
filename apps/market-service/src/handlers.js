/* eslint-disable camelcase */
import { Outbox } from '@theseus/db'
import { makeId } from '@theseus/domain'
import {
    createEmitter,
    createCommander,
} from '@theseus/kafka'

import {
    eventTree   as EVT,
    commandTree as CMD,
} from '@theseus/contracts'

import { quote } from './seed.js'

const emit    = createEmitter('market-service')
const command = createCommander('market-service')

const r2 = x => Math.round(x * 100) / 100

// ── row helpers ──────────────────────────────────────────────

/**
 * @description
 * the locked stock:
 * every trade serializes on its station × good row,
 * prices are computed from the very stock the reservation decrements
 */
async function lockStock(client, stid, gid) {
    const { rows: [ row ] } = await client.query(`
        SELECT stock, target
          FROM station_inventory
         WHERE stid = $1
           AND gid = $2
           FOR update
    `, [ stid, gid ])
    return row
}

function bumpStock(client, stid, gid, delta) {
    return client.query(`
        UPDATE station_inventory
           SET stock = stock + $3, updated = now()
         WHERE stid = $1
           AND gid = $2
     RETURNING stock, target
    `, [ stid, gid, delta ]).then(rs => rs.rows[ 0 ])
}

// ── SHIPS ────────────────────────────────────────────────────

async function getShip(client, sid) {
    const { rows: [ row ] } = await client.query(`
        SELECT *
          FROM ships
         WHERE sid = $1
        `, [ sid ])
    return row
}

// ── CARGO ────────────────────────────────────────────────────

async function cargoTotal(client, sid) {
    const { rows: [ row ] } = await client.query(`
        SELECT COALESCE(SUM(quantity), 0)
            AS total
          FROM cargo
         WHERE sid = $1
        `, [ sid ])
    return +row.total
}

// ── TRADES ───────────────────────────────────────────────────

function settleTrade(client, tid, status) {
    return client.query(`
        UPDATE trades
           SET status = $2, updated = now()
         WHERE tid = $1`,
    [ tid, status ])
}

async function pendingTrade(client, rfid) {
    const { rows: [ row ] } = await client.query(`
        SELECT *
          FROM trades
         WHERE tid = $1
           AND status = 'pending'
           FOR update
    `, [ rfid ])
    return row
}

// ── MARKETS ──────────────────────────────────────────────────

// update the quote board + emit the new price, from fresh stock
async function publishQuote(client, stid, gid, { stock, target }) {
    const { price_buy, price_sell } = quote(gid, stock, target)

    await client.query(`
        UPDATE markets
           SET price_buy = $3, price_sell = $4, updated = now()
         WHERE stid = $1
           AND gid = $2
    `, [ stid, gid, price_buy, price_sell ])

    return emit(EVT.market.price.changed, {
        aggregate_id  : stid,
        aggregate_type: 'market',

        payload: {
            stid,
            gid,
            price_buy,
            price_sell,
        },
    })
}

function rejectTrade(client, side, data) {
    return Outbox.write(client, [
        emit(EVT.trade.rejected, {
            aggregate_type: 'trade',
            aggregate_id  : data.payload.stid,
            causation_id  : data.cmd ?? data.causation_id,
            correlation_id: data.correlation_id,
            payload       : {
                side,
                reason  : data.reason,
                quantity: data.payload.quantity,
                stid    : data.payload.stid,
                gid     : data.payload.gid,
                pid     : data.payload.pid,
                sid     : data.payload.sid,
            },
        }),
    ])
}

// ─────────────────────────────────────────────────────────────

export function createHandlers(pool, transact) {
    return {

        // ── ships mirror, from events.ship ───────────────────

        async [ EVT.ship.created ]({ payload: { sid, pid, stid, capacity }}) {
            await pool.query(`
                INSERT INTO ships (sid, pid, stid, status, capacity)
                     VALUES ($1, $2, $3, 'docked', $4)
                ON CONFLICT (sid)
                 DO NOTHING
            `, [ sid, pid, stid, capacity ])
        },

        async [ EVT.ship.departed ]({ payload: { sid }}) {
            await pool.query(`
                 UPDATE ships
                    SET status = 'transit', stid = null
                  WHERE sid = $1
            `, [ sid ])
        },

        async [ EVT.ship.arrived ]({ payload: { sid, stid }}) {
            await pool.query(`
                UPDATE ships
                   SET status = 'docked', stid = $2
                 WHERE sid = $1
            `, [ sid, stid ])
        },

        // ── buy saga ─────────────────────────────────────────

        async [ CMD.market.buy.requested ]({ cmd, correlation_id, payload }) {

            await transact(pool, async client => {

                const reject = reason => rejectTrade(client, 'buy', { cmd, reason, correlation_id, payload })

                const inv = await lockStock(client, payload.stid, payload.gid)
                if (!inv) return reject('unknown market')

                const ship = await getShip(client, payload.sid)
                if (!ship) return reject('ship unknown')

                if (ship.status  !== 'docked'
                    || ship.stid !== payload.stid) return reject('ship not docked here')

                if (inv.stock < payload.quantity) return reject('insufficient stock')

                const load = await cargoTotal(client, payload.sid)
                if (load + payload.quantity > ship.capacity) return reject('over capacity')

                const { price_buy } = quote(payload.gid, inv.stock, inv.target)
                if (price_buy > payload.price_unit_max) return reject('price above limit')

                const tid    = makeId('trade')
                const amount = r2(price_buy * payload.quantity)

                await bumpStock(client, payload.stid, payload.gid, -payload.quantity)
                await client.query(`
                    INSERT INTO trades (tid, pid, sid, stid, gid, side, quantity, price_unit, price_total)
                         VALUES ($1, $2, $3, $4, $5, 'buy', $6, $7, $8)
                `, [ tid, payload.pid, payload.sid, payload.stid, payload.gid, payload.quantity, price_buy, amount ])

                await Outbox.write(client, [
                    command(CMD.wallet.debit.requested, {
                        correlation_id,
                        payload: {
                            pid   : payload.pid,
                            rfid  : tid,
                            amount,
                            reason: `trade ${ tid }`,
                        },
                    }),
                ])
            })
        },

        // ── sell saga ────────────────────────────────────────

        async [ CMD.market.sell.requested ]({ cmd, correlation_id, payload }) {
            await transact(pool, async client => {

                const {
                    pid,
                    sid,
                    stid,
                    gid,
                    quantity,
                    price_unit_min,
                } = payload
                const reject = reason => rejectTrade(client, 'sell', { cmd, reason, correlation_id, payload })

                const inv = await lockStock(
                    client,
                    stid,
                    gid,
                )

                if (!inv) return reject('unknown market')

                const ship = await getShip(
                    client,
                    sid,
                )

                if (!ship) return reject('ship unknown')

                if (ship.status  !== 'docked'
                    || ship.stid !== stid) return reject('ship not docked here')

                const { rows: [ cargo ] } = await client.query(`
                    SELECT quantity
                      FROM cargo
                     WHERE sid = $1
                       AND gid = $2
                       FOR update
                `, [
                    sid,
                    gid,
                ])

                if (!cargo || cargo.quantity < quantity) return reject('insufficient cargo')

                const { price_sell } = quote(
                    gid,
                    inv.stock,
                    inv.target,
                )

                if (price_sell < price_unit_min)
                    return reject('price below limit')

                const tid         = makeId('trade')
                const price_total = r2(price_sell * quantity)

                await client.query(`
                    UPDATE cargo
                       SET quantity = quantity - $3, updated = now()
                     WHERE sid = $1
                       AND gid = $2
                `, [
                    sid,
                    gid,
                    quantity,
                ])

                await client.query(`
                    INSERT INTO trades (tid, pid, sid, gid, stid, quantity, price_unit, price_total, side)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sell')
                `, [
                    tid,
                    pid,
                    sid,
                    gid,
                    stid,
                    quantity,
                    price_sell,
                    price_total,
                ])

                await Outbox.write(client, [
                    command(CMD.wallet.credit.requested, {
                        correlation_id,
                        payload: {
                            pid   : payload.pid,
                            rfid  : tid,
                            amount: price_total,
                            reason: `trade ${ tid }`,
                        },
                    }),
                ])
            })
        },

        // ── saga continuation, from events.wallet ────────────

        async [ EVT.wallet.debited ](e)  { await settle(pool, transact, 'buy', e) },
        async [ EVT.wallet.credited ](e) { await settle(pool, transact, 'sell', e) },

        // ── compensation ─────────────────────────────────────

        async [ EVT.wallet.transaction.rejected ]({ eid: causation_id, correlation_id, payload: { rfid, reason }}) {
            await transact(pool, async client => {
                const trade = await pendingTrade(client, rfid)
                if (!trade) return // not ours

                if (trade.side === 'buy') /* release the reserved stock */ {
                    await bumpStock(
                        client,
                        trade.stid,
                        trade.gid,
                        trade.quantity,
                    )
                }
                else /* hand the cargo back */ {
                    await client.query(`
                        UPDATE cargo
                           SET quantity = quantity + $3, updated = now()
                         WHERE sid = $1
                           AND gid = $2
                    `, [
                        trade.sid,
                        trade.gid,
                        trade.quantity,
                    ])
                }

                await settleTrade(client, trade.tid, 'rejected')
                await rejectTrade(client, trade.side, {
                    reason,
                    causation_id,
                    correlation_id,
                    payload: trade,
                })
            })
        },
    }
}

/*
    wallet money moved - finish the pending trade:
    move the goods,
    republish the quote from fresh stock,
    announce the trade
*/
async function settle(pool, transact, side, { eid: causation_id, correlation_id, payload }) {
    await transact(pool, async client => {
        const trade = await pendingTrade(client, payload.rfid)
        if (!trade || trade.side !== side) return // not ours

        const buying = side === 'buy'

        let stocked
        if (buying) {
            stocked = await lockStock(client, trade.stid, trade.gid)
            await client.query(`
                INSERT INTO cargo (sid, gid, quantity, updated)
                     VALUES ($1, $2, $3, now())
                ON CONFLICT (sid, gid)
                  DO UPDATE
                        SET quantity = cargo.quantity + $3, updated = now()
            `, [
                trade.sid,
                trade.gid,
                trade.quantity,
            ])
        }
        else {
            // station takes delivery - stock returns to the pool
            stocked = await bumpStock(client, trade.stid, trade.gid, trade.quantity)
        }

        await settleTrade(client, trade.tid, 'executed')

        await Outbox.write(client, [
            emit(buying
                ? EVT.cargo.loaded
                : EVT.cargo.unloaded, {
                correlation_id,
                causation_id,
                aggregate_id  : trade.sid,
                aggregate_type: 'cargo',
                payload       : {
                    gid     : trade.gid,
                    pid     : trade.pid,
                    sid     : trade.sid,
                    stid    : trade.stid,
                    quantity: trade.quantity,
                },
            }),
            emit(EVT.trade.executed, {
                correlation_id,
                causation_id,
                aggregate_id  : trade.stid,
                aggregate_type: 'trade',
                payload       : {
                    side,
                    tid        : trade.tid,
                    gid        : trade.gid,
                    pid        : trade.pid,
                    sid        : trade.sid,
                    stid       : trade.stid,
                    quantity   : trade.quantity,
                    price_unit : +trade.price_unit,
                    price_total: +trade.price_total,
                },
            }),
            await publishQuote(
                client,
                trade.stid,
                trade.gid,
                stocked,
            ),
        ])
    })
}
