/* eslint-disable camelcase */

export async function renameShip(client, sid, pid, name) {
    const { rows: [ row ] } = await client.query(`
        UPDATE ships
           SET name = $3, updated = now()
         WHERE sid = $1
           AND pid = $2
     RETURNING sid, pid, name
    `, [ sid, pid, name ])
    return row
}

export function insertShip(client, { sid, pid, stid, name, capacity, velocity, hull, rig }) {
    return client.query(`
        INSERT INTO ships (sid, pid, stid, name, capacity, velocity, hull, rig)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [ sid, pid, stid, name, capacity, velocity, hull, rig ])
}

export async function getShip(client, sid) {
    const { rows: [ row ] } = await client.query('SELECT * FROM ships WHERE sid = $1', [ sid ])
    return row
}

// locked, for the fitting saga
export async function lockShip(client, sid) {
    const { rows: [ row ] } = await client.query('SELECT * FROM ships WHERE sid = $1 FOR UPDATE', [ sid ])
    return row
}

// rig increments atomically - no separate read to race against.
export async function updateShipRig(client, sid, { capacity, velocity }) {
    const { rows: [ row ] } = await client.query(`
        UPDATE ships
           SET rig      = rig + 1,
               capacity = $2,
               velocity = $3,
               updated  = now()
         WHERE sid = $1
     RETURNING *
    `, [ sid, capacity, velocity ])
    return row
}

export function updateShipDeparture(client, sid, { from, to, departed, arrives, manifest, causation_id, correlation_id }) {
    return client.query(`
        UPDATE ships
           SET status         = 'transit',
               "from"         = $2,
               "to"           = $3,
               departs        = $4,
               arrives        = $5,
               manifest       = $6,
               causation_id   = $7,
               correlation_id = $8,
               updated        = now()
         WHERE sid = $1
    `, [ sid, from, to, departed, arrives, manifest, causation_id, correlation_id ])
}

// ── FITTED MODULES ───────────────────────────────────────────

export async function getFittedModules(client, sid) {
    const { rows } = await client.query(`
        SELECT slot, gid
          FROM fitted_modules
         WHERE sid = $1
    `, [ sid ])
    return Object.fromEntries(rows.map(r => [ r.slot, r.gid ]))
}

// wholesale replace, from a previewRig() proposed rig.
// a slot missing from `fitted` gets no row, which is what an empty slot is
export async function setFittedModules(client, sid, fitted) {

    await client.query(`
        DELETE FROM fitted_modules
         WHERE sid = $1
    `, [ sid ])

    for (const [ slot, gid ] of Object.entries(fitted)) {
        await client.query(`
            INSERT INTO fitted_modules (sid, slot, gid)
            VALUES ($1, $2, $3)
        `, [ sid, slot, gid ])
    }
}

// ── MODULE OPERATIONS ────────────────────────────────────────

export async function hasPendingOperation(client, sid) {
    const { rows } = await client.query(`
        SELECT 1 FROM module_operations
         WHERE sid = $1
           AND status = 'pending'
    `, [ sid ])
    return rows.length > 0
}

export function insertOperation(client, data) {
    return client.query(`
        INSERT INTO module_operations (
            oid, pid, sid,
            slot,    type,
            incoming, outgoing,
            proposed, stats,
            causation_id,
            correlation_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
        data.oid, data.pid, data.sid,
        data.slot,         data.type,
        data.incoming, data.outgoing,
        JSON.stringify(data.proposed),
        JSON.stringify(data.stats),
        data.causation_id,
        data.correlation_id,
    ])
}

export async function lockOperation(client, oid) {
    const { rows: [ row ] } = await client.query(`
        SELECT * FROM module_operations
         WHERE oid = $1
        FOR UPDATE
    `, [ oid ])
    return row
}

// both transition from 'pending' only - a 2nd reply for an already-
// terminal operation updates nothing, and the handler treats that as a no-op
export function completeOperation(client, oid) {
    return client.query(`
        UPDATE module_operations
           SET status = 'done', updated = now()
         WHERE oid = $1
           AND status = 'pending'
    `, [ oid ])
}

export function rejectOperation(client, oid) {
    return client.query(`
        UPDATE module_operations
           SET status = 'rejected', updated = now()
         WHERE oid = $1
           AND status = 'pending'
    `, [ oid ])
}
