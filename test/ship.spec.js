import test   from 'node:test'
import assert from 'node:assert/strict'

import { readEnv } from '@theseus/config'

import {
    makeCmd,
    fakeClient,
    fakeTransact,
    outboxEvents,
} from '#packages/testing/src/index.js?title=🧪 🛸 SHIP'

import { createHandlers   } from '#apps/ship-service/src/handlers.js'
import { travel, distance } from '#apps/ship-service/src/travel.js'

const TIME_SCALE = readEnv('TIME_SCALE', 20)

// ── helpers ──────────────────────────────────────────────────────────────────

const dockedShip = (over = {}) => ({
    'select * from ships': () => ({ rows: [{
        sid     : 's1',
        pid     : 'p1',
        stid    : 'sol.outpost',
        name    : 'far treasure',
        status  : 'docked',
        capacity: 20,
        velocity: '0.6', // pg numeric comes back as string
        ...over,
    }]}),
})

const trip = makeCmd({
    sid : 's1',
    pid : 'p1',
    from: 'sol.outpost',
    to  : 'alpha.exchange',
})

// ── travel math ───────────────────────────────────────────────────────────────

test('distance returns mapped light years, order independent', () => {
    assert.equal(distance('sol.outpost', 'alpha.exchange'), 4.3)
    assert.equal(distance('alpha.exchange', 'sol.outpost'), 4.3)
    assert.equal(distance('barnards.port', 'sol.outpost'), 6.0)
})

test('distance throws on unknown route', () => {
    assert.throws(
        () => distance('sol.outpost', 'lost.harbor'),
        /unknown route/,
    )
})

test('travel computes absolute and relativistic years', () => {
    const t   = travel('sol.outpost', 'alpha.exchange', 0.6)
    const abs = 4.3 / 0.6

    assert.equal(t.years_abs, abs)
    assert.equal(t.years_rel, abs * Math.sqrt(1 - 0.6 ** 2))
    assert.ok(t.years_rel < t.years_abs, 'proper time is shorter')
})

test('travel converts common-frame years to game milliseconds', () => {
    const t = travel('sol.outpost', 'barnards.port', 0.6)

    assert.equal(t.ms, 6.0 / 0.6 * TIME_SCALE * 1000)
    assert.ok(new Date(t.arrives) > new Date, 'arrives in the future')
})

// ── travelRequested - rejections ─────────────────────────────────────────────

for (const [ reason, over, cmd ] of [
    [ 'ship not found'                     , { 'select * from ships': () => ({ rows: []}) }],
    [ 'ship not docked'                    , dockedShip({ status: 'transit' }) ],
    [ 'ship not at origin'                 , dockedShip({ stid: 'barnards.port' }) ],
    [ 'origin and destination are the same', dockedShip(), makeCmd({ ...trip.payload, to: 'sol.outpost' }) ],
]) {
    test(`travelRequested rejects: ${ reason }`, async () => {
        const client   = fakeClient(over)
        const handlers = createHandlers({}, fakeTransact(client))

        await handlers[ 'ship.travel.requested.v1' ](cmd ?? trip)

        const events = outboxEvents(client)
        assert.equal(events.length, 1)
        assert.equal(events[ 0 ].event_type, 'ship.travel.rejected.v1')
        assert.equal(events[ 0 ].payload.reason, reason)
        assert.ok(!client.log.find(({ sql }) => sql.includes('update ships')), 'ship untouched')
    })
}

// ── travelRequested - departed ────────────────────────────────────────────────

test('travelRequested updates ship to transit and emits ship.departed', async t => {
    t.mock.timers.enable({ apis: [ 'setTimeout' ]})

    const client   = fakeClient(dockedShip())
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'ship.travel.requested.v1' ](trip)

    const update = client.log.find(({ sql }) => sql.includes('update ships'))
    assert.ok(update, 'ship updated')
    assert.match(update.sql, /status\s+= 'transit'/)

    const events = outboxEvents(client)
    assert.equal(events.length, 1)

    const [ e ] = events
    assert.equal(e.event_type, 'ship.departed.v1')
    assert.equal(e.causation_id, 'cmd-test')
    assert.equal(e.payload.sid, 's1')
    assert.equal(e.payload.from, 'sol.outpost')
    assert.equal(e.payload.to, 'alpha.exchange')
    assert.equal(e.payload.years_abs, 4.3 / 0.6)
    assert.equal(e.payload.years_rel, 4.3 / 0.6 * Math.sqrt(1 - 0.6 ** 2))
})

test('travelRequested docks ship at destination and emits ship.arrived after timeout', async t => {
    t.mock.timers.enable({ apis: [ 'setTimeout' ]})

    const client   = fakeClient(dockedShip())
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'ship.travel.requested.v1' ](trip)

    const { ms } = travel('sol.outpost', 'alpha.exchange', 0.6)
    t.mock.timers.tick(ms + 1)
    await new Promise(r => setImmediate(r)) // let async arrive() drain

    const update = client.log.findLast(({ sql }) => sql.includes('update ships'))
    assert.match(update.sql, /status\s+= 'docked'/)
    assert.equal(update.params[ 1 ], 'alpha.exchange', 'stid = destination')

    const events = outboxEvents(client)
    assert.equal(events.length, 2)
    assert.equal(events[ 1 ].event_type, 'ship.arrived.v1')
    assert.equal(events[ 1 ].payload.stid, 'alpha.exchange')
    assert.equal(events[ 1 ].payload.sid, 's1')
    assert.equal(events[ 1 ].causation_id, 'cmd-test')
})

test('travelRequested schedules no arrival on rejection', async t => {
    t.mock.timers.enable({ apis: [ 'setTimeout' ]})

    const client   = fakeClient(dockedShip({ status: 'transit' }))
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'ship.travel.requested.v1' ](trip)

    t.mock.timers.tick(1e9)
    await new Promise(r => setImmediate(r))

    const events = outboxEvents(client)
    assert.equal(events.length, 1, 'only the rejection, no arrival')
})

// ── player.created - starter ship saga ────────────────────────────────────────

test('playerCreated seeds the starter ship and emits ship.created', async () => {
    const client   = fakeClient()
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'player.created.v1' ]({
        eid           : 'evt-test',
        correlation_id: 'corr-test',
        payload       : { pid: 'p1', handle: 'alice' },
    })

    const insert = client.log.find(({ sql }) => sql.includes('insert into ships'))
    assert.ok(insert, 'ship inserted')
    assert.equal(insert.params[ 1 ], 'p1')
    assert.equal(insert.params[ 2 ], 'sol.outpost')

    const [ e ] = outboxEvents(client)
    assert.equal(e.event_type, 'ship.created.v1')
    assert.equal(e.causation_id, 'evt-test')
    assert.equal(e.correlation_id, 'corr-test')
    assert.match(e.payload.sid, /^ship_/)
    assert.equal(e.payload.pid, 'p1')
    assert.equal(e.payload.stid, 'sol.outpost')
    assert.equal(e.payload.name, 'far treasure')
    assert.equal(e.payload.capacity, 20)
    assert.equal(e.payload.velocity, 0.6)
})
