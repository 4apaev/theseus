import test   from 'node:test'
import assert from 'node:assert/strict'

import {
    makeCmd,
    fakeClient,
    fakeTransact,
    outboxEvents,
} from '#testing/index.js'

import { createHandlers } from '#comms/handlers.js'

// ── fixtures ─────────────────────────────────────────────────────────────────

const dockedShip = (over = {}) => () => ({ rows: [{
    sid        : 's1',
    pid        : 'p1',
    stid       : 'sol.outpost',
    status     : 'docked',
    has_ansible: true,
    ...over,
}]})

const empty = () => ({ rows: []})

const sendCmd = (over = {}) => makeCmd({ pid: 'p1', body: 'hello', ...over })

function handlers(overrides = []) {
    const client = fakeClient(overrides)
    return { client, fx: createHandlers(client, fakeTransact(client)) }
}

// ── ships mirror ─────────────────────────────────────────────────────────────

test('ships mirror follows created / departed / arrived / rig.changed', async () => {
    const { client, fx } = handlers()

    await fx[ 'ship.created.v1' ]({
        payload: { sid: 's1', pid: 'p1', stid: 'sol.outpost', fitted: [{ slot: 'utility1', gid: 'ansible.mk1' }]},
    })
    await fx[ 'ship.departed.v1' ]({ payload: { sid: 's1' }})
    await fx[ 'ship.arrived.v1' ]({ payload: { sid: 's1', stid: 'barnards.port' }})
    await fx[ 'ship.rig.changed.v1' ]({ payload: { sid: 's1', fitted: [{ slot: 'utility1', gid: 'reactor.mk1' }]}})

    const [ ins, dep, arr, rig ] = client.log
    assert.match(ins.sql, /INSERT INTO ships/i)
    assert.equal(ins.params[ 3 ], true, 'starter rig carries an ansible')
    assert.match(dep.sql, /SET status = 'transit'/i)
    assert.match(arr.sql, /SET status = 'docked'/i)
    assert.equal(arr.params[ 1 ], 'barnards.port')
    assert.match(rig.sql, /has_ansible/i)
    assert.equal(rig.params[ 1 ], false, 'the transceiver left the slot')
})

// ── station chat ─────────────────────────────────────────────────────────────
// messageSendRequested's real order for chat: shipByPid, then
// insertMessage, then the outbox write. neither one reads its
// own response.

test('station chat rejects: ship unknown', async () => {
    const { client, fx } = handlers([ empty ])
    await fx[ 'comms.send.requested.v1' ](sendCmd())

    const [ e ] = outboxEvents(client)
    assert.equal(e.event_type, 'comms.send.rejected.v1')
    assert.equal(e.payload.reason, 'ship unknown')
})

test('station chat rejects: not docked anywhere', async () => {
    const { client, fx } = handlers([ dockedShip({ stid: null }) ])
    await fx[ 'comms.send.requested.v1' ](sendCmd())

    const [ e ] = outboxEvents(client)
    assert.equal(e.payload.reason, 'not docked anywhere')
})

test('station chat sends instantly, delivered at send time', async () => {
    const { client, fx } = handlers([ dockedShip() ])
    await fx[ 'comms.send.requested.v1' ](sendCmd())

    const insert = client.log.find(({ sql }) => sql.includes('INSERT INTO messages'))
    assert.equal(insert.params[ 2 ], void 0, 'no recipient')
    assert.equal(insert.params[ 3 ], 'sol.outpost')

    const [ e ] = outboxEvents(client)
    assert.equal(e.event_type, 'comms.sent.v1')
    assert.equal(e.payload.stid, 'sol.outpost')
    assert.equal(e.payload.deliver, e.payload.sent, 'no delay')
})

// ── ansible ──────────────────────────────────────────────────────────────────
// messageSendRequested's real order for a dm: shipByPid for the
// sender, then shipByPid for the recipient, then insertMessage,
// then the outbox write.

test('ansible rejects: cannot message yourself', async () => {
    const { client, fx } = handlers()
    await fx[ 'comms.send.requested.v1' ](sendCmd({ to: 'p1' }))

    const [ e ] = outboxEvents(client)
    assert.equal(e.payload.reason, 'cannot message yourself')
})

test('ansible rejects: unknown recipient', async () => {
    const { client, fx } = handlers([ dockedShip(), empty ])
    await fx[ 'comms.send.requested.v1' ](sendCmd({ to: 'p2' }))

    const [ e ] = outboxEvents(client)
    assert.equal(e.payload.reason, 'unknown recipient')
})

test('ansible rejects: sender has no transceiver fitted', async () => {
    const { client, fx } = handlers([
        dockedShip({ has_ansible: false }),
        dockedShip({ pid: 'p2' }),
    ])
    await fx[ 'comms.send.requested.v1' ](sendCmd({ to: 'p2' }))

    const [ e ] = outboxEvents(client)
    assert.equal(e.payload.reason, 'no ansible fitted')
})

test('ansible rejects: recipient has no transceiver fitted', async () => {
    const { client, fx } = handlers([
        dockedShip(),
        dockedShip({ pid: 'p2', has_ansible: false }),
    ])
    await fx[ 'comms.send.requested.v1' ](sendCmd({ to: 'p2' }))

    const [ e ] = outboxEvents(client)
    assert.equal(e.payload.reason, 'recipient has no ansible fitted')
})

test('ansible rejects: sender in transit', async () => {
    const { client, fx } = handlers([
        dockedShip({ stid: null }),
        dockedShip({ pid: 'p2' }),
    ])
    await fx[ 'comms.send.requested.v1' ](sendCmd({ to: 'p2' }))

    const [ e ] = outboxEvents(client)
    assert.equal(e.payload.reason, 'cannot send while in transit')
})

test('ansible rejects: recipient in transit', async () => {
    const { client, fx } = handlers([
        dockedShip(),
        dockedShip({ pid: 'p2', stid: null }),
    ])
    await fx[ 'comms.send.requested.v1' ](sendCmd({ to: 'p2' }))

    const [ e ] = outboxEvents(client)
    assert.equal(e.payload.reason, 'recipient is in transit')
})

test('ansible message at the same station delivers with 0 delay', async () => {
    const { client, fx } = handlers([
        dockedShip(),
        dockedShip({ pid: 'p2' }), // same stid: sol.outpost
    ])
    await fx[ 'comms.send.requested.v1' ](sendCmd({ to: 'p2' }))

    const [ e ] = outboxEvents(client)
    assert.equal(e.event_type, 'comms.sent.v1')
    assert.equal(e.payload.to, 'p2')
    assert.equal(e.payload.deliver, e.payload.sent, 'no distance, no delay')
})

test('ansible message across a real distance delays delivery', async () => {
    const { client, fx } = handlers([
        dockedShip(),
        dockedShip({ pid: 'p2', stid: 'alpha.exchange' }),
    ])
    await fx[ 'comms.send.requested.v1' ](sendCmd({ to: 'p2' }))

    const [ e ] = outboxEvents(client)
    assert.ok(new Date(e.payload.deliver) > new Date(e.payload.sent), 'a real distance takes real time')
})
