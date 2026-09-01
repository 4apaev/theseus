/* eslint-disable camelcase */

// row-level helpers, shared by every saga in handlers.js. each takes the
// live transaction client - a lock or a mutation must run on the same
// connection as the commit or reject that follows it.

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

export function insertShip(client, { sid, pid, stid, name, capacity, velocity }) {
    return client.query(`
        INSERT INTO ships (sid, pid, stid, name, capacity, velocity)
             VALUES ($1, $2, $3, $4, $5, $6)
    `, [ sid, pid, stid, name, capacity, velocity ])
}

export async function getShip(client, sid) {
    const { rows: [ row ] } = await client.query('SELECT * FROM ships WHERE sid = $1', [ sid ])
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
