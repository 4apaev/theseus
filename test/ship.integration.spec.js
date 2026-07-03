import test   from 'node:test'
import assert from 'node:assert/strict'

import { DB }    from '@theseus/db'
import { Query } from '@theseus/util'
import * as Kfk  from '@theseus/kafka'

import {
    guid,
    waitFor,
    collectEvents,
    createPublisher,
} from '#packages/testing/src/index.js?title=🧪 INTEGRATION 🛸 SHIP'

import {
    eventTree as EVT,
    commandTree as CMD,
} from '@theseus/contracts'

const PRFX = 'itg_ship_'

// shrink travel times: sol.outpost → alpha.exchange ≈ 717ms
// must be set before ship-service (travel.js) is imported - see test.before
process.env.TIME_SCALE = '0.1'

// ── helpers ──────────────────────────────────────────────────────────────────

async function seedShip(stid = 'sol.outpost') {
    const sid = guid(PRFX)
    const pid = guid(PRFX)
    await sql`
        insert into ships (sid, pid, stid, name, capacity, velocity)
        values (${ sid }, ${ pid }, ${ stid }, ${ 'far treasure' }, ${ 20 }, ${ 0.6 })`
    return { sid, pid }
}

// ── fixtures ─────────────────────────────────────────────────────────────────

let kafka, service, pool, sql, publish

test.before(async () => {
    // dynamic import so TIME_SCALE above wins over .env before travel.js reads it
    const { start } = await import('@theseus/ship-service')

    kafka   = Kfk.createMemoryKafka()
    pool    = DB.create({ schema: 'ship' })
    publish = createPublisher(Kfk.createProducer({ client: kafka }))
    service = await start(kafka)
    sql = (...a) => Query(pool)(...a).then(r => r.rows[ 0 ])
})

test.after(() => {
    service?.stop()
    pool?.end()
})

// ── tests ────────────────────────────────────────────────────────────────────

test('travel - departs, then arrives and docks at destination', async () => {
    const { sid, pid } = await seedShip()
    const { events, stop } = collectEvents(kafka, [ 'events.ship' ])

    await publish(CMD.ship.travel.requested, {
        sid,
        pid,
        from: 'sol.outpost',
        to  : 'alpha.exchange',
    })

    // DB write is synchronous with publishCommand (memory kafka)
    const transit = await sql`select status, "to" from ships where sid = ${ sid }`
    assert.equal(transit.status, 'transit')
    assert.equal(transit.to, 'alpha.exchange')

    const departed = e => e.event_type === EVT.ship.departed && e.payload.sid === sid
    const arrived  = e => e.event_type === EVT.ship.arrived  && e.payload.sid === sid

    await waitFor(() => events.some(arrived))
    stop()

    const dep = events.find(departed)
    assert.equal(dep.payload.from, 'sol.outpost')
    assert.equal(dep.payload.to, 'alpha.exchange')
    assert.equal(dep.payload.years_abs, 4.3 / 0.6)
    assert.ok(dep.payload.years_rel < dep.payload.years_abs, 'proper time is shorter')

    const arr = events.find(arrived)
    assert.equal(arr.payload.stid, 'alpha.exchange')

    const ship = await sql`select status, stid, arrived from ships where sid = ${ sid }`
    assert.equal(ship.status, 'docked')
    assert.equal(ship.stid, 'alpha.exchange')
    assert.ok(ship.arrived, 'arrived timestamp set')
})

test('travel - unknown ship emits travel.rejected', async () => {
    const { events, stop } = collectEvents(kafka, [ 'events.ship' ])
    const sid = guid(PRFX)

    await publish(CMD.ship.travel.requested, {
        sid,
        pid : guid(PRFX),
        from: 'sol.outpost',
        to  : 'alpha.exchange',
    })

    const rejected = e => e.event_type === EVT.ship.travel.rejected && e.payload.sid === sid
    await waitFor(() => events.some(rejected))
    stop()

    assert.equal(events.find(rejected).payload.reason, 'ship not found')
})

test('travel - wrong origin emits travel.rejected, ship stays docked', async () => {
    const { sid, pid } = await seedShip('barnards.port')
    const { events, stop } = collectEvents(kafka, [ 'events.ship' ])

    await publish(CMD.ship.travel.requested, {
        sid,
        pid,
        from: 'sol.outpost',
        to  : 'alpha.exchange',
    })

    const rejected = e => e.event_type === EVT.ship.travel.rejected && e.payload.sid === sid
    await waitFor(() => events.some(rejected))
    stop()

    assert.equal(events.find(rejected).payload.reason, 'ship not at origin')

    const ship = await sql`select status, stid from ships where sid = ${ sid }`
    assert.equal(ship.status, 'docked')
    assert.equal(ship.stid, 'barnards.port')
})
