// @ts-check

/**
 * @description
 * row-level helpers. every handler shares them. each function
 * takes the live transaction client - a mutation must run on
 * the same connection as the commit or reject that follows it.
 *
 */

// ── SHIPS (mirror) ───────────────────────────────────────────

/**
 * @param {Pool} pool
 * @param {Ship} sh
 * @return {Promise<{ rows: QRShip[] }>}
 */
export async function insertShip(pool, sh) {
    return pool.query(`
        INSERT INTO ships (sid, pid, stid, status, has_ansible)
        VALUES ($1, $2, $3, 'docked', $4)
        ON CONFLICT (sid)
            DO NOTHING
    `, [ sh.sid, sh.pid, sh.stid, hasAnsible(sh.fitted) ])
}

/**
 * @param {Pool} pool
 * @param {Ship} sh
 */
export async function shipDeparted(pool, sh) {
    await pool.query(`
        UPDATE ships
           SET status = 'transit', stid = NULL
         WHERE sid = $1
    `, [ sh.sid ])
}

/**
 * @param {Pool} pool
 * @param {Ship} sh
 */
export async function shipArrived(pool, sh) {
    await pool.query(`
        UPDATE ships
           SET status = 'docked', stid = $2
         WHERE sid = $1
    `, [ sh.sid, sh.stid ])
}

/**
 * @param {Pool} pool
 * @param {Ship} sh
 */
export async function shipRigChanged(pool, sh) {
    await pool.query(`
        UPDATE ships
           SET has_ansible = $2
         WHERE sid = $1
    `, [ sh.sid, hasAnsible(sh.fitted) ])
}

/**
 * @param {Client} client
 * @param {string} pid
 * @return {Promise<QRShip|undefined>}
 */
export async function shipByPid(client, pid) {
    const { rows: [ row ] } = await client.query(`
        SELECT *
          FROM ships
         WHERE pid = $1
    `, [ pid ])
    return row
}

/**
 * @param {Mod[]} fitted
 * @return {boolean}
 */
export function hasAnsible(fitted) {
    return fitted.some(f => f.gid === 'ansible.mk1')
}

// ── MESSAGES ─────────────────────────────────────────────────

/**
 * @param {Client} client
 * @return {Promise<DueMssg[]>}
 */
export async function updateMessages(client) {
    const { rows } = await client.query(`
        UPDATE messages
            SET delivered = deliver
            WHERE delivered IS NULL
            AND deliver <= now()
            AND "to" IS NOT NULL
        RETURNING mid, "from", "to", body, delivered
    `)
    return rows
}

/**
 * @param {Client} client
 * @param {Mssg} msg
 */
export function insertMessage(client, msg) {
    return client.query(`
        INSERT INTO messages (mid, "from", "to", stid, body, sent, deliver, delivered)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
        msg.mid,
        msg.from,
        msg.to,
        msg.stid,
        msg.body,
        msg.sent,
        msg.deliver,
        msg.delivered,
    ])
}

/**
 * @typedef { import('pg').Pool } Pool
 * @typedef { import('pg').Client } Client
 * @typedef { import('../types/queries.js').Mod } Mod
 * @typedef { import('../types/queries.js').Ship } Ship
 * @typedef { import('../types/queries.js').Mssg } Mssg
 * @typedef { import('../types/queries.js').DueMssg } DueMssg
 * @typedef { import('../types/queries.js').QRShip } QRShip
 */
