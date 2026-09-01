/* eslint-disable camelcase */
import { Outbox } from '@theseus/db'
import { guid } from '@theseus/util'
import { goods, cargoLoad } from '@theseus/domain'
import {
    createEmitter,
    createCommander,
} from '@theseus/kafka'

import {
    eventTree   as EVT,
    commandTree as CMD,
    eventDefinition,
} from '@theseus/contracts'

import { quote } from './seed.js'

const emit    = createEmitter('market-service')
const command = createCommander('market-service')

const r2 = x => Math.round(x * 100) / 100

// ── STOCK ────────────────────────────────────────────────────

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
           FOR UPDATE
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

async function lockShip(client, sid) {
    const { rows: [ row ] } = await client.query(`
        SELECT *
          FROM ships
         WHERE sid = $1
           FOR UPDATE
        `, [ sid ])
    return row
}

// ── CARGO ────────────────────────────────────────────────────

async function cargoTotal(client, sid) {
    const { rows } = await client.query(`
        SELECT gid, quantity
          FROM cargo
         WHERE sid = $1
        `, [ sid ])
    return cargoLoad(rows, goods)
}

async function lockCargo(client, sid, gid) {
    const { rows: [ row ] } = await client.query(`
        SELECT quantity
          FROM cargo
         WHERE sid = $1
           AND gid = $2
           FOR UPDATE
    `, [ sid, gid ])
    return row
}

function bumpCargo(client, sid, gid, delta) {
    return client.query(`
        INSERT INTO cargo (sid, gid, quantity, updated)
             VALUES ($1, $2, $3, now())
        ON CONFLICT (sid, gid)
          DO UPDATE
                SET quantity = cargo.quantity + $3, updated = now()
    `, [ sid, gid, delta ])
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
           FOR UPDATE
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

// every reject path writes one event to the outbox - envelope fields
// wrap around a payload the caller already shaped. rejectTrade and
// rejectExchange below are the only 2 shapes; both funnel through this.
// aggregate_type is the event's own topic - never a 3rd copy of it.
function emitRejection(client, { event, aggregate_id }, { causation_id, correlation_id }, payload) {
    return Outbox.write(client, [
        emit(event, {
            aggregate_type: eventDefinition(event).topic,
            aggregate_id,
            causation_id,
            correlation_id,
            payload,
        }),
    ])
}

function rejectTrade(client, side, { reason, cmd, causation_id, correlation_id, payload }) {
    return emitRejection(client,
        { event: EVT.trade.rejected, aggregate_id: payload.stid },
        { causation_id: cmd ?? causation_id, correlation_id },
        {
            side,
            reason,
            quantity: payload.quantity,
            stid    : payload.stid,
            gid     : payload.gid,
            pid     : payload.pid,
            sid     : payload.sid,
        })
}

function rejectExchange(client, { reasons, causation_id, correlation_id, payload: p }) {
    return emitRejection(client,
        { event: EVT.cargo.module.exchange.rejected, aggregate_id: p.sid },
        { causation_id, correlation_id },
        { operation: p.operation, pid: p.pid, sid: p.sid, reasons })
}

// ─────────────────────────────────────────────────────────────

/*
    the ships mirror, from events.ship - pure and idempotent,
    no outbox writes, no side effects. that also makes it the full
    replay set for scripts/rebuild-market-ships.js: a postgres-only
    reset can empty `ships` while this consumer group keeps its
    committed offset, so it never re-consumes the events that would
    refill it (docs/tech.debt.md's "missing ship" bug). cargo/trades/
    station_inventory stay out of that rebuild on purpose - they are
    saga-owned, and replaying their own commands would re-fire the
    saga's side effects (wallet debits, outbox writes), not just
    restate a fact.
*/
export function shipMirrorHandlers(pool) {
    return {
        [ EVT.ship.created  ]: shipCreated,
        [ EVT.ship.departed ]: shipDeparted,
        [ EVT.ship.arrived  ]: shipArrived,
    }

    async function shipCreated({ payload: { sid, pid, stid, capacity }}) {
        await pool.query(`
            INSERT INTO ships (sid, pid, stid, status, capacity)
                 VALUES ($1, $2, $3, 'docked', $4)
            ON CONFLICT (sid)
             DO NOTHING
        `, [ sid, pid, stid, capacity ])
    }

    async function shipDeparted({ payload: { sid }}) {
        await pool.query(`
             UPDATE ships
                SET status = 'transit', stid = NULL
              WHERE sid = $1
        `, [ sid ])
    }

    async function shipArrived({ payload: { sid, stid }}) {
        await pool.query(`
            UPDATE ships
               SET status = 'docked', stid = $2
             WHERE sid = $1
        `, [ sid, stid ])
    }
}

export function createHandlers(pool, transact) {
    return {
        ...shipMirrorHandlers(pool),
        [ CMD.market.buy.requested            ]: marketBuyRequested,
        [ CMD.market.sell.requested           ]: marketSellRequested,
        [ CMD.cargo.module.exchange.requested ]: cargoModuleExchangeRequested,
        [ EVT.wallet.debited                  ]: walletDebited,
        [ EVT.wallet.credited                 ]: walletCredited,
        [ EVT.wallet.transaction.rejected     ]: walletTransactionRejected,
    }

    // ── buy saga ─────────────────────────────────────────────────

    async function marketBuyRequested({ cmd, correlation_id, payload }) {

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
            const added = payload.quantity * goods[ payload.gid ].volume
            if (load + added > ship.capacity) return reject('over capacity')

            const { price_buy } = quote(payload.gid, inv.stock, inv.target)
            if (price_buy > payload.price_unit_max) return reject('price above limit')

            const tid    = guid('trade')
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
    }

    // ── sell saga ────────────────────────────────────────────────

    async function marketSellRequested({ cmd, correlation_id, payload }) {
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

            const cargo = await lockCargo(client, sid, gid)
            if (!cargo || cargo.quantity < quantity) return reject('insufficient cargo')

            const { price_sell } = quote(
                gid,
                inv.stock,
                inv.target,
            )

            if (price_sell < price_unit_min)
                return reject('price below limit')

            const tid         = guid('trade')
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
    }

    /*
        ── module exchange ──────────────────────────────────────────

        ship-service already validated the rig.
        this saga only moves the packages, weighted by volume
        against the ship's proposed capacity.
        no station stock or trade involved
    */

    async function cargoModuleExchangeRequested({ cmd: causation_id, correlation_id, payload }) {
        const { pid, sid, operation, incoming, outgoing, capacity_next } = payload

        await transact(pool, async client => {
            const reject = reasons => rejectExchange(client, {
                correlation_id,
                causation_id,
                reasons,
                payload,
            })

            const ship = await lockShip(client, sid)
            if (!ship) return reject([ 'ship not found' ])

            if (incoming) {
                const held = await lockCargo(client, sid, incoming)
                if (!held || held.quantity < 1) return reject([ `${ incoming } not in cargo` ])
            }

            const delta = (outgoing ? goods[ outgoing ].volume : 0)
                        - (incoming ? goods[ incoming ].volume : 0)

            const load = await cargoTotal(client, sid)
            if (load + delta > capacity_next) return reject([ 'over capacity' ])

            incoming && await bumpCargo(client, sid, incoming, -1)
            outgoing && await bumpCargo(client, sid, outgoing, 1)

            await Outbox.write(client, [
                emit(EVT.cargo.module.exchanged, {
                    causation_id,
                    correlation_id,
                    aggregate_id  : sid,
                    aggregate_type: 'cargo',
                    payload       : {
                        pid, sid, operation, incoming, outgoing,
                        load: load + delta,
                        capacity_next,
                    },
                }),
            ])
        })
    }

    // ── saga continuation, from events.wallet ───────────────────

    async function walletDebited(e)  { await settle(pool, transact, 'buy', e) }
    async function walletCredited(e) { await settle(pool, transact, 'sell', e) }

    // ── compensation ─────────────────────────────────────────────

    async function walletTransactionRejected({ eid: causation_id, correlation_id, payload: { rfid, reason }}) {
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
