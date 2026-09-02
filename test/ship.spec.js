import test           from 'node:test'
import assert         from 'node:assert/strict'
import { setTimeout } from 'node:timers/promises'
import { TIME_SCALE, universe } from '@theseus/domain'
import {
    makeCmd,
    fakeClient,
    fakeTransact,
    outboxEvents,
} from '#testing/index.js'

import { createHandlers   } from '#ship/handlers.js'
import { travel, distance } from '#ship/travel.js'
import { pollArrivals     } from '#ship/arrivals.js'

// ── helpers ──────────────────────────────────────────────────────────────────

const dockedShip = (over = {}) => () => ({ rows: [{
    sid     : 's1',
    pid     : 'p1',
    stid    : 'sol.outpost',
    name    : 'far treasure',
    status  : 'docked',
    capacity: 20,
    velocity: '0.6', // pg numeric comes back as string
    hull    : 'starter',
    rig     : 1,
    ...over,
}]})

const noPendingRefit = () => ({ rows: []})

const trip = makeCmd({
    sid : 's1',
    pid : 'p1',
    from: 'sol.outpost',
    to  : 'alpha.exchange',
})

// ── travel math ───────────────────────────────────────────────────────────────

test('distance returns mapped light years, order independent', () => {
    assert.equal(distance('sol.outpost', 'alpha.exchange'), 4.32)
    assert.equal(distance('alpha.exchange', 'sol.outpost'), 4.32)
    assert.equal(distance('barnards.port', 'sol.outpost'), 5.95)
})

test('distance throws on unknown route', () => {
    assert.throws(
        () => distance('sol.outpost', 'lost.harbor'),
        /unknown route/,
    )
})

test('travel computes absolute and relativistic years', () => {
    const t   = travel('sol.outpost', 'alpha.exchange', 0.6)
    const abs = 4.32 / 0.6

    assert.equal(t.years_abs, abs)
    assert.equal(t.years_rel, abs * Math.sqrt(1 - 0.6 ** 2))
    assert.ok(t.years_rel < t.years_abs, 'proper time is shorter')
})

test('travel converts common-frame years to game milliseconds', () => {
    const t = travel('sol.outpost', 'barnards.port', 0.6)

    assert.equal(t.ms, 5.95 / 0.6 * TIME_SCALE * 1000)
    assert.ok(new Date(t.arrives) > new Date, 'arrives in the future')
})

// ── the route speed limit ────────────────────────────────────────────────────

test('an in-system route flies at its own speed limit, not the ship velocity', () => {
    const ly = universe.distance('sol.venus', 'sol.mars')
    const c  = universe.speedLimit('sol.venus', 'sol.mars')
    const t  = travel('sol.venus', 'sol.mars', 0.6)

    assert.equal(t.years_abs, ly / c, 'the route caps the ship')
    assert.ok(t.years_abs > 0.1, `a short hop still takes game time, got ${ t.years_abs }`)
})

test('a sublight hop ages the pilot and the galaxy by the same amount', () => {
    const t = travel('sol.venus', 'sol.mars', 0.6)
    assert.ok(t.years_abs - t.years_rel < 1e-6, 'no dilation below light speed')
})

test('a route between stars leaves the speed to the ship', () => {
    const fast = travel('sol.outpost', 'alpha.exchange', 0.9)
    const slow = travel('sol.outpost', 'alpha.exchange', 0.3)

    assert.equal(fast.years_abs, 4.32 / 0.9)
    assert.ok(fast.years_abs < slow.years_abs, 'a faster ship arrives sooner')
})

// ── travelRequested - rejections ─────────────────────────────────────────────
// every case here rejects after exactly 1 meaningful query (the select) -
// the outbox insert that follows never reads its own response, so 1 queue
// entry safely answers both.

for (const [ reason, over, cmd ] of [
    [ 'ship not found'                     , [ () => ({ rows: []}) ]],
    [ 'ship not docked'                    , [ dockedShip({ status: 'transit' }) ]],
    [ 'ship not at origin'                 , [ dockedShip({ stid: 'barnards.port' }) ]],
    [ 'origin and destination are the same', [ dockedShip() ], makeCmd({ ...trip.payload, to: 'sol.outpost' }) ],
]) {
    test(`travelRequested rejects: ${ reason }`, async () => {
        const client   = fakeClient(over)
        const handlers = createHandlers({}, fakeTransact(client))

        await handlers[ 'ship.travel.requested.v1' ](cmd ?? trip)

        const events = outboxEvents(client)
        assert.equal(events.length, 1)
        assert.equal(events[ 0 ].event_type, 'ship.travel.rejected.v1')
        assert.equal(events[ 0 ].payload.reason, reason)
        assert.ok(!client.log.find(({ sql }) => sql.includes('UPDATE ships')), 'ship untouched')
    })
}

// ── travelRequested - departed ────────────────────────────────────────────────

test('travelRequested updates ship to transit and emits ship.departed', async () => {
    const client   = fakeClient([ dockedShip(), noPendingRefit ])
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'ship.travel.requested.v1' ](trip)

    const update = client.log.find(({ sql }) => sql.includes('UPDATE ships'))
    assert.ok(update, 'ship updated')
    assert.match(update.sql, /status\s+= 'transit'/)
    assert.deepEqual(update.params[ 5 ], [], 'a direct hop leaves no manifest')
    assert.equal(update.params[ 6 ], 'cmd-test', 'causation_id persisted')
    assert.equal(update.params[ 7 ], 'corr-test', 'correlation_id persisted')

    const events = outboxEvents(client)
    assert.equal(events.length, 1)

    const [ e ] = events
    assert.equal(e.event_type, 'ship.departed.v1')
    assert.equal(e.causation_id, 'cmd-test')
    assert.equal(e.payload.sid, 's1')
    assert.equal(e.payload.from, 'sol.outpost')
    assert.equal(e.payload.to, 'alpha.exchange')
    assert.equal(e.payload.years_abs, 4.32 / 0.6)
    assert.equal(e.payload.years_rel, 4.32 / 0.6 * Math.sqrt(1 - 0.6 ** 2))
})

// a destination need not be a direct neighbor - path() resolves the
// full hop sequence, and everything after the first hop becomes the
// ship's manifest, consumed later by arrivals.js
test('travelRequested resolves a multi-hop destination and stores the rest as manifest', async () => {
    const client   = fakeClient([ dockedShip(), noPendingRefit ])
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'ship.travel.requested.v1' ](makeCmd({ sid: 's1', pid: 'p1', from: 'sol.outpost', to: 'wolf.reach' }))

    const update = client.log.find(({ sql }) => sql.includes('UPDATE ships'))
    assert.equal(update.params[ 2 ], 'alpha.exchange', 'the first hop, not the final destination')
    assert.deepEqual(update.params[ 5 ], [ 'wolf.reach' ], 'the rest of the path')

    const [ e ] = outboxEvents(client)
    assert.equal(e.event_type, 'ship.departed.v1')
    assert.equal(e.payload.to, 'alpha.exchange')
})

test('travelRequested rejects when no path connects the stations', async t => {
    t.mock.method(universe, 'path', () => void 0)

    const client   = fakeClient([ dockedShip(), noPendingRefit ])
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'ship.travel.requested.v1' ](trip)

    const events = outboxEvents(client)
    assert.equal(events.length, 1)
    assert.equal(events[ 0 ].event_type, 'ship.travel.rejected.v1')
    assert.equal(events[ 0 ].payload.reason, 'no route to destination')
    assert.ok(!client.log.find(({ sql }) => sql.includes('UPDATE ships')), 'ship untouched')
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

    const insert = client.log.find(({ sql }) => sql.includes('INSERT INTO ships'))
    assert.ok(insert, 'ship inserted')
    assert.equal(insert.params[ 1 ], 'p1')
    assert.equal(insert.params[ 2 ], 'sol.outpost')
    assert.equal(insert.params[ 6 ], 'starter', 'hull')
    assert.equal(insert.params[ 7 ], 1, 'rig')

    const fitted = client.log.filter(({ sql }) => sql.includes('INSERT INTO fitted_modules'))
    assert.deepEqual(fitted.map(q => q.params.slice(1)), [
        [ 'power1', 'reactor.mk1' ],
        [ 'cruise1', 'cruise.mk1' ],
        [ 'cargo1', 'cargo.mk1' ],
    ])

    const [ e ] = outboxEvents(client)
    assert.equal(e.event_type, 'ship.created.v1')
    assert.equal(e.causation_id, 'evt-test')
    assert.equal(e.correlation_id, 'corr-test')
    assert.match(e.payload.sid, /^ship_/)
    assert.equal(e.payload.pid, 'p1')
    assert.equal(e.payload.stid, 'sol.outpost')
    assert.equal(typeof e.payload.name, 'string')
    assert.ok(e.payload.name.length > 0, 'ship gets a name')
    assert.equal(e.payload.capacity, 20)
    assert.equal(e.payload.velocity, 0.6)
    assert.equal(e.payload.hull, 'starter')
    assert.equal(e.payload.rig, 1)
    assert.deepEqual(e.payload.fitted, [
        { slot: 'power1', gid: 'reactor.mk1' },
        { slot: 'cruise1', gid: 'cruise.mk1' },
        { slot: 'cargo1', gid: 'cargo.mk1' },
    ])
    assert.equal(e.payload.power, 2)
    assert.equal(e.payload.power_pool, 8)
})

// ── renameRequested ──────────────────────────────────────────────────────────

test('renameRequested updates the ship and emits ship.renamed', async () => {
    const client   = fakeClient([ () => ({ rows: [{ sid: 's1', pid: 'p1', name: 'Argo' }]}) ])
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'ship.rename.requested.v1' ](makeCmd({ sid: 's1', pid: 'p1', name: 'Argo' }))

    const update = client.log.find(({ sql }) => sql.includes('UPDATE ships'))
    assert.deepEqual(update.params, [ 's1', 'p1', 'Argo' ], 'the pid scopes the update')

    const [ e ] = outboxEvents(client)
    assert.equal(e.event_type, 'ship.renamed.v1')
    assert.equal(e.payload.name, 'Argo')
    assert.equal(e.payload.sid, 's1')
})

// the update is scoped by pid, so a foreign sid matches no row
test('renameRequested rejects a ship the player does not own', async () => {
    const client   = fakeClient([ () => ({ rows: []}) ])
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'ship.rename.requested.v1' ](makeCmd({ sid: 'someone-elses', pid: 'p1', name: 'Argo' }))

    const [ e ] = outboxEvents(client)
    assert.equal(e.event_type, 'ship.rename.rejected.v1')
    assert.equal(e.payload.reason, 'ship not found')
})

// ── module fitting saga ─────────────────────────────────────────────────────
// fitModule's real order: lockShip, hasPendingOperation, getFittedModules,
// then insertOperation + the outbox command - only reached past a passed check.

const fittedRows = (rows = [
    { slot: 'power1' , gid: 'reactor.mk1' },
    { slot: 'cruise1', gid: 'cruise.mk1' },
    { slot: 'cargo1' , gid: 'cargo.mk1' },
]) => () => ({ rows })

const installCmd = (over = {}) => makeCmd({ pid: 'p1', sid: 's1', slot: 'power1', gid: 'reactor.mk2', ...over })
const removeCmd  = (over = {}) => makeCmd({ pid: 'p1', sid: 's1', slot: 'cargo1', ...over })

for (const [ reason, overrides, cmd, type ] of [
    [ 'ship not found', [ () => ({ rows: []}) ]],
    [ 'refit pending'  , [ dockedShip(), () => ({ rows: [{ oid: 'refit_x' }]}) ]],
    [ 'reactor.mk2 does not fit the cargo slot', [ dockedShip(), noPendingRefit, fittedRows() ], installCmd({ slot: 'cargo1' }) ],
    [ 'nothing fitted at slot cargo1', [ dockedShip(), noPendingRefit, fittedRows([]) ], removeCmd(), 'remove' ],
]) {
    test(`install/remove rejects: ${ reason }`, async () => {
        const client   = fakeClient(overrides)
        const handlers = createHandlers({}, fakeTransact(client))

        await handlers[ type === 'remove' ? 'ship.module.remove.requested.v1' : 'ship.module.install.requested.v1' ](cmd ?? installCmd())

        const [ e ] = outboxEvents(client)
        assert.equal(e.event_type, 'ship.module.operation.rejected.v1')
        assert.ok(e.payload.reasons.some(r => r.includes(reason)), e.payload.reasons)
        assert.match(e.payload.operation, /^refit_/, 'a fresh id rides the rejection too')
        assert.ok(!client.log.some(({ sql }) => sql.includes('INSERT INTO module_operations')), 'nothing persisted')
    })
}

test('install replaces the occupied slot: proposed rig, stats and outgoing gid all persist', async () => {
    const client   = fakeClient([ dockedShip(), noPendingRefit, fittedRows() ])
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'ship.module.install.requested.v1' ](installCmd())

    const insert = client.log.find(({ sql }) => sql.includes('INSERT INTO module_operations'))
    assert.ok(insert, 'operation persisted')
    const [ oid, pid, sid, slot, type, incoming, outgoing, proposed, stats ] = insert.params
    assert.match(oid, /^refit_/)
    assert.equal(pid, 'p1')
    assert.equal(sid, 's1')
    assert.equal(slot, 'power1')
    assert.equal(type, 'install')
    assert.equal(incoming, 'reactor.mk2')
    assert.equal(outgoing, 'reactor.mk1', 'the module already in that slot')
    assert.equal(JSON.parse(proposed).power1, 'reactor.mk2')
    assert.equal(JSON.parse(stats).power.available, 12, 'reactor.mk2 grants +9 over the hull base of 3')

    const [ e ] = outboxEvents(client)
    assert.equal(e.command_type, 'cargo.module.exchange.requested.v1')
    assert.equal(e.payload.operation, oid)
    assert.equal(e.payload.incoming, 'reactor.mk2')
    assert.equal(e.payload.outgoing, 'reactor.mk1')
    assert.equal(e.payload.capacity_next, 20, 'a reactor swap does not touch capacity')
})

test('remove empties the slot: no incoming, capacity_next reflects the loss', async () => {
    const client   = fakeClient([ dockedShip(), noPendingRefit, fittedRows() ])
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'ship.module.remove.requested.v1' ](removeCmd())

    const insert = client.log.find(({ sql }) => sql.includes('INSERT INTO module_operations'))
    const [ , , , slot, type, incoming, outgoing ] = insert.params
    assert.equal(slot, 'cargo1')
    assert.equal(type, 'remove')
    assert.equal(incoming, void 0)
    assert.equal(outgoing, 'cargo.mk1')

    const [ e ] = outboxEvents(client)
    assert.equal(e.payload.incoming, void 0)
    assert.equal(e.payload.outgoing, 'cargo.mk1')
})

// ── cargo exchange continuation, from events.cargo ───────────────────────────
// cargoModuleExchanged's real order: lockOperation, then setFittedModules'
// delete + 1 insert per proposed slot (unread), then updateShipRig (read).
// completeOperation follows and is never read - the queue can stop short.

const pendingOperation = (over = {}) => () => ({ rows: [{
    oid     : 'refit_1',
    pid     : 'p1',
    sid     : 's1',
    slot    : 'power1',
    type    : 'install',
    incoming: 'reactor.mk2',
    outgoing: 'reactor.mk1',
    proposed: { power1: 'reactor.mk2' }, // 1 slot - keeps the fixture queue short
    stats   : { capacity: 20, velocity: 0.6, power: { available: 12, used: 3 }},
    status  : 'pending',
    ...over,
}]})

const updatedShip = (over = {}) => () => ({ rows: [{
    sid: 's1', hull: 'starter', rig: 2, capacity: 20, velocity: '0.6', ...over,
}]})

const unread = () => ({ rows: []})

test('cargoModuleExchanged commits the rig and emits ship.rig.changed', async () => {
    const client   = fakeClient([ pendingOperation(), unread, unread, updatedShip() ])
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'cargo.module.exchanged.v1' ]({
        eid: 'evt-1', correlation_id: 'corr-test',
        payload: { pid: 'p1', sid: 's1', operation: 'refit_1', incoming: 'reactor.mk2', outgoing: 'reactor.mk1', load: 0, capacity_next: 20 },
    })

    const del = client.log.find(({ sql }) => sql.includes('DELETE FROM fitted_modules'))
    assert.ok(del, 'old rig cleared')
    const ins = client.log.find(({ sql }) => sql.includes('INSERT INTO fitted_modules'))
    assert.deepEqual(ins.params, [ 's1', 'power1', 'reactor.mk2' ])

    const complete = client.log.find(({ sql }) => /module_operations/.test(sql) && /'done'/.test(sql))
    assert.ok(complete, 'operation marked done')

    const [ e ] = outboxEvents(client)
    assert.equal(e.event_type, 'ship.rig.changed.v1')
    assert.equal(e.causation_id, 'evt-1')
    assert.equal(e.aggregate_version, 2)
    assert.equal(e.payload.operation, 'refit_1')
    assert.equal(e.payload.slot, 'power1')
    assert.deepEqual(e.payload.fitted, [{ slot: 'power1', gid: 'reactor.mk2' }])
    assert.equal(e.payload.hull, 'starter')
    assert.equal(e.payload.rig, 2)
    assert.equal(e.payload.incoming, 'reactor.mk2')
    assert.equal(e.payload.outgoing, 'reactor.mk1')
    assert.equal(e.payload.power, 3)
    assert.equal(e.payload.power_pool, 12)
})

test('cargoModuleExchanged ignores an unknown operation id', async () => {
    const client   = fakeClient([ () => ({ rows: []}) ])
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'cargo.module.exchanged.v1' ]({ eid: 'evt-1', correlation_id: 'c', payload: { operation: 'refit_ghost' }})

    assert.equal(client.log.length, 1, 'only the lookup ran')
    assert.equal(outboxEvents(client).length, 0)
})

test('cargoModuleExchanged ignores an already-terminal operation', async () => {
    const client   = fakeClient([ pendingOperation({ status: 'done' }) ])
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'cargo.module.exchanged.v1' ]({ eid: 'evt-1', correlation_id: 'c', payload: { operation: 'refit_1' }})

    assert.equal(client.log.length, 1, 'no double-apply')
    assert.equal(outboxEvents(client).length, 0)
})

test('cargoModuleExchangeRejected marks the operation rejected and forwards the reasons', async () => {
    const client   = fakeClient([ pendingOperation() ])
    const handlers = createHandlers({}, fakeTransact(client))

    await handlers[ 'cargo.module.exchange.rejected.v1' ]({
        eid: 'evt-2', correlation_id: 'corr-test',
        payload: { operation: 'refit_1', pid: 'p1', sid: 's1', reasons: [ 'over capacity' ]},
    })

    const [ e ] = outboxEvents(client)
    assert.equal(e.event_type, 'ship.module.operation.rejected.v1')
    assert.equal(e.payload.operation, 'refit_1')
    assert.deepEqual(e.payload.reasons, [ 'over capacity' ])
})

// ── arrivals - poll & dock due ships ────────────────────────────────────────
// arriveDue's claim response is the only one anything reads - every query
// that follows (the outbox insert, and advanceManifest's own update +
// insert) discards its response, so 1 queue entry covers a whole tick.

test('pollArrivals docks a due ship and emits ship.arrived', async () => {
    const due = [{
        sid : 's1',
        pid : 'p1',
        stid: 'alpha.exchange',
        arrived        : new Date('2026-01-01T00:00:00.000Z'), // pg returns Date for timestamp cols
        velocity       : '0.6',
        manifest       : [],
        causation_id   : 'cmd-test',
        correlation_id : 'corr-test',
    }]

    const client = fakeClient([
        () => ({ rows: due.splice(0) }),
    ])

    const poller = pollArrivals({}, fakeTransact(client), { interval: 10 })
    await setTimeout(20)
    poller.stop()

    const events = outboxEvents(client)
    assert.equal(events.length, 1, 'no manifest, no re-departure')
    assert.equal(events[ 0 ].event_type, 'ship.arrived.v1')
    assert.equal(events[ 0 ].causation_id, 'cmd-test')
    assert.equal(events[ 0 ].correlation_id, 'corr-test')
    assert.equal(events[ 0 ].payload.sid, 's1')
    assert.equal(events[ 0 ].payload.stid, 'alpha.exchange')
    assert.equal(events[ 0 ].payload.arrived, '2026-01-01T00:00:00.000Z', 'Date coerced to isoTime string')
})

// a manifest stop is only a waypoint - the ship docks for a moment,
// then arrivals.js re-departs it toward the next hop on its own
test('pollArrivals advances a ship with a manifest instead of leaving it docked', async () => {
    const due = [{
        sid : 's1',
        pid : 'p1',
        stid: 'alpha.exchange',
        arrived        : new Date('2026-01-01T00:00:00.000Z'),
        velocity       : '0.6',
        manifest       : [ 'wolf.reach' ],
        causation_id   : 'cmd-test',
        correlation_id : 'corr-test',
    }]

    const client = fakeClient([
        () => ({ rows: due.splice(0) }),
    ])

    const poller = pollArrivals({}, fakeTransact(client), { interval: 10 })
    await setTimeout(20)
    poller.stop()

    const advance = client.log.find(({ sql }) => sql.includes('WHERE sid = $1'))
    assert.ok(advance, 'the ship is re-departed')
    assert.equal(advance.params[ 0 ], 's1')
    assert.equal(advance.params[ 1 ], 'alpha.exchange', 'departs from the stop it just made')
    assert.equal(advance.params[ 2 ], 'wolf.reach', 'toward the next hop')
    assert.deepEqual(advance.params[ 5 ], [], 'manifest exhausted')

    const events = outboxEvents(client)
    assert.equal(events.length, 2, 'the stop, then the re-departure')
    assert.equal(events[ 0 ].event_type, 'ship.arrived.v1')
    assert.equal(events[ 1 ].event_type, 'ship.departed.v1')
    assert.equal(events[ 1 ].payload.from, 'alpha.exchange')
    assert.equal(events[ 1 ].payload.to, 'wolf.reach')
})

test('pollArrivals leaves not-yet-due ships alone', async () => {
    const client = fakeClient([
        () => ({ rows: []}),
    ])

    const poller = pollArrivals({}, fakeTransact(client), { interval: 10 })
    await setTimeout(20)
    poller.stop()

    assert.equal(outboxEvents(client).length, 0)
})

test('pollArrivals stop prevents further polling', async () => {
    let ticks = 0
    const client = fakeClient([
        () => { ticks++; return { rows: []} },
    ])

    const poller = pollArrivals({}, fakeTransact(client), { interval: 10 })
    await setTimeout(5)
    poller.stop()
    const snapshot = ticks
    await setTimeout(50)
    assert.equal(ticks, snapshot)
})
