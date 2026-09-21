import test   from 'node:test'
import assert from 'node:assert/strict'

import { DB } from '@theseus/db'
import { guid } from '#testing/index.js'
import { eventTree as EVT } from '@theseus/contracts'
import { createHandlers } from '#projection/handlers.js'

/*
    the "ship not docked" fault of 2026-09-20.

    a ship arrived at alpha, and the player left for sirius 5ms later.
    the 2 outbox rows carried the same `created`, so the publish order
    fell to postgres. the projection applied the departure, then applied
    the older arrival on top, and the client saw a docked ship that
    ship-service knew was in transit.

    the outbox now orders by seq, and these guards are the second lock:
    an event that lands late changes nothing.
*/

const PRFX = 'itg_order'

let pool, handlers

const at = ms => new Date(ms).toISOString()

const T0 = Date.now()
const ARRIVED  = at(T0)          // the ship reaches alpha
const DEPARTED = at(T0 + 5)      // it leaves for sirius, 5ms later

function ship(sid) {
    return {
        sid, pid: guid(PRFX), name: 'the late reply', stid: 'alpha.exchange',
        status: 'docked', capacity: 20, velocity: 0.6, acceleration: 0.002,
        hull: 'starter', rig: 1, power: 1, power_pool: 3,
    }
}

const arrived = sid => ({
    event_type: EVT.ship.arrived,
    payload   : { sid, stid: 'alpha.exchange', arrived: ARRIVED },
})

const departed = sid => ({
    event_type: EVT.ship.departed,
    payload   : {
        sid, from: 'alpha.exchange', to: 'sirius.gate',
        departed: DEPARTED, arrives: at(T0 + 300_000),
        years_abs: 8.6, years_rel: 6.9,
    },
})

test.before(async () => {
    pool     = DB.create({ schema: 'projection' })
    handlers = createHandlers(pool, DB.transact)
})

test.after(async () => {
    await pool.query('DELETE FROM ships WHERE pid LIKE $1', [ PRFX + '%' ])
    await pool?.end()
})

async function seed(sid) {
    const s = ship(sid)
    await pool.query(`
        INSERT INTO ships (sid, pid, name, stid, status, capacity, velocity, acceleration, hull, rig, power, power_pool, arrived)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [ s.sid, s.pid, s.name, s.stid, s.status, s.capacity, s.velocity,
        s.acceleration, s.hull, s.rig, s.power, s.power_pool, at(T0 - 60_000) ])
    return s
}

const read = async sid =>
    (await pool.query('SELECT status, stid, departs FROM ships WHERE sid = $1', [ sid ])).rows[ 0 ]

test('events in order leave the ship in transit', async () => {
    const sid = guid(PRFX)
    await seed(sid)

    await handlers[ EVT.ship.arrived ](arrived(sid))
    await handlers[ EVT.ship.departed ](departed(sid))

    const row = await read(sid)
    assert.equal(row.status, 'transit')
})

/*  the same 2 events, delivered the wrong way round. before the guards
    this left the ship docked at alpha, and every travel command then
    answered "ship not docked"  */
test('a late arrival does not overwrite a newer departure', async () => {
    const sid = guid(PRFX)
    await seed(sid)

    await handlers[ EVT.ship.departed ](departed(sid))
    await handlers[ EVT.ship.arrived ](arrived(sid))

    const row = await read(sid)
    assert.equal(row.status, 'transit', 'the older arrival must not win')
    assert.equal(row.stid, 'alpha.exchange')
})

test('the same arrival twice changes nothing', async () => {
    const sid = guid(PRFX)
    await seed(sid)

    await handlers[ EVT.ship.arrived ](arrived(sid))
    const first = await read(sid)

    await handlers[ EVT.ship.arrived ](arrived(sid))
    assert.deepEqual(await read(sid), first)
})
