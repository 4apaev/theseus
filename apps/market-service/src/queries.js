import { goods, cargoLoad } from '@theseus/domain'

/**
 * @description
 * row-level helpers, shared by every saga in handlers.js. each takes the
 * live transaction client - a lock or a mutation must run on the same
 * connection as the commit or reject that follows it.
 */

// ── STOCK ────────────────────────────────────────────────────

/**
 * @description
 * the locked stock:
 * every trade serializes on its station × good row,
 * prices are computed from the very stock the reservation decrements
 */
export async function lockStock(client, stid, gid) {
    const { rows: [ row ] } = await client.query(`
        SELECT stock, target
          FROM station_inventory
         WHERE stid = $1
           AND gid = $2
           FOR UPDATE
    `, [ stid, gid ])
    return row
}

export async function bumpStock(client, stid, gid, delta) {
    const { rows: [ row ] } = await client.query(`
        UPDATE station_inventory
           SET stock = stock + $3, updated = now()
         WHERE stid = $1
           AND gid = $2
     RETURNING stock, target
    `, [ stid, gid, delta ])
    return row
}

// ── SHIPS ────────────────────────────────────────────────────

export async function getShip(client, sid) {
    const { rows: [ row ] } = await client.query(`
        SELECT *
          FROM ships
         WHERE sid = $1
        `, [ sid ])
    return row
}

// locked, for the module exchange saga - it must not interleave with
// a concurrent exchange on the same ship
export async function lockShip(client, sid) {
    const { rows: [ row ] } = await client.query(`
        SELECT *
          FROM ships
         WHERE sid = $1
           FOR UPDATE
        `, [ sid ])
    return row
}

// ── CARGO ────────────────────────────────────────────────────

// volume-weighted, Σ(quantity × good.volume) - a packaged module is not
// one cargo unit like a crate of grain. see domain's cargoLoad().
export async function cargoTotal(client, sid) {
    const { rows } = await client.query(`
        SELECT gid, quantity
          FROM cargo
         WHERE sid = $1
        `, [ sid ])
    return cargoLoad(rows, goods)
}

export async function lockCargo(client, sid, gid) {
    const { rows: [ row ] } = await client.query(`
        SELECT quantity
          FROM cargo
         WHERE sid = $1
           AND gid = $2
           FOR UPDATE
    `, [ sid, gid ])
    return row
}

export function bumpCargo(client, sid, gid, delta) {
    return client.query(`
        INSERT INTO cargo (sid, gid, quantity, updated)
             VALUES ($1, $2, $3, now())
        ON CONFLICT (sid, gid)
          DO UPDATE
                SET quantity = cargo.quantity + $3, updated = now()
    `, [ sid, gid, delta ])
}

// ── TRADES ───────────────────────────────────────────────────

export function settleTrade(client, tid, status) {
    return client.query(`
        UPDATE trades
           SET status = $2, updated = now()
         WHERE tid = $1`,
    [ tid, status ])
}

export async function pendingTrade(client, rfid) {
    const { rows: [ row ] } = await client.query(`
        SELECT *
          FROM trades
         WHERE tid = $1
           AND status = 'pending'
           FOR UPDATE
    `, [ rfid ])
    return row
}
