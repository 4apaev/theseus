import test   from 'node:test'
import assert from 'node:assert/strict'

import {
    fakeClient,
    fakeTransact,
} from '#testing/index.js'

import { createHandlers } from '#projection/handlers.js'

/*
    createHandlers takes no producer - this service writes read models
    only, it never emits. fakeTransact(client) calls its callback with
    just the client, matching shipRigChanged/cargoModuleExchanged's own
    signature (they build their own Query(client) tag internally).
*/

function handlers(overrides = []) {
    const client = fakeClient(overrides)
    return { client, fx: createHandlers(client, fakeTransact(client)) }
}

const rigChanged = (over = {}) => ({
    payload: {
        sid: 's1',
        pid: 'p1',
        slot: 'power1',
        hull: 'starter',
        rig: 2,
        power: 3,
        capacity: 20,
        velocity: 0.6,
        power_pool: 12,
        fitted: [{ slot: 'power1', gid: 'reactor.mk2' }],
        ...over,
    },
})

// ── ship.created - fitted modules ────────────────────────────────────────────

test('ship.created inserts hull/rig/power and one fitted_modules row per slot', async () => {
    const { client, fx } = handlers()

    await fx[ 'ship.created.v1' ]({
        payload: {
            sid: 's1',
            pid: 'p1',
            stid: 'sol.outpost',
            name: 'x',
            capacity: 20,
            velocity: 0.6,
            hull: 'starter',
            rig: 1,
            power: 2,
            power_pool: 8,
            fitted: [
                { slot: 'power1', gid: 'reactor.mk1' },
                { slot: 'cruise1', gid: 'cruise.mk1' },
            ],
        },
    })

    const ship = client.log.find(({ sql }) => sql.includes('INSERT INTO ships'))
    assert.ok(ship.params.includes('starter'))
    assert.ok(ship.params.includes(1), 'rig')
    assert.ok(ship.params.includes(2), 'power')
    assert.ok(ship.params.includes(8), 'power_pool')

    const fitted = client.log.filter(({ sql }) => sql.includes('INSERT INTO fitted_modules'))
    assert.deepEqual(fitted.map(q => q.params), [
        [ 's1', 'power1', 'reactor.mk1' ],
        [ 's1', 'cruise1', 'cruise.mk1' ],
    ])
})

// ── ship.rig.changed - only when newer ───────────────────────────────────────

test('ship.rig.changed replaces the rig when its version is newer', async () => {
    const { client, fx } = handlers([ () => ({ rowCount: 1 }) ])

    await fx[ 'ship.rig.changed.v1' ](rigChanged())

    const del = client.log.find(({ sql }) => sql.includes('DELETE FROM fitted_modules'))
    assert.ok(del, 'old rig cleared')
    const ins = client.log.find(({ sql }) => sql.includes('INSERT INTO fitted_modules'))
    assert.deepEqual(ins.params, [ 's1', 'power1', 'reactor.mk2' ])
})

test('ship.rig.changed no-ops when the stored rig is not older - stale or duplicate', async () => {
    const { client, fx } = handlers([ () => ({ rowCount: 0 }) ])

    await fx[ 'ship.rig.changed.v1' ](rigChanged())

    assert.equal(client.log.length, 1, 'only the conditional update ran')
    assert.ok(!client.log.some(({ sql }) => sql.includes('fitted_modules')))
})

// ── cargo.module.exchanged - incoming/outgoing deltas ────────────────────────

test('cargo.module.exchanged applies both deltas: incoming out, outgoing in', async () => {
    const { client, fx } = handlers()

    await fx[ 'cargo.module.exchanged.v1' ]({
        payload: { sid: 's1', pid: 'p1', operation: 'refit_1', incoming: 'reactor.mk1', outgoing: 'reactor.mk2', load: 4, capacity_next: 20 },
    })

    const dec = client.log.find(({ sql }) => sql.includes('UPDATE cargo'))
    assert.deepEqual(dec.params, [ 's1', 'reactor.mk1' ])

    const inc = client.log.find(({ sql }) => sql.includes('INSERT INTO cargo'))
    assert.deepEqual(inc.params, [ 's1', 'reactor.mk2' ], 'quantity 1 is a literal, not a bind param')
})

test('cargo.module.exchanged - install only: no incoming to return, cargo only shrinks', async () => {
    const { client, fx } = handlers()

    await fx[ 'cargo.module.exchanged.v1' ]({
        payload: { sid: 's1', pid: 'p1', operation: 'refit_2', incoming: 'reactor.mk1', outgoing: void 0, load: 0, capacity_next: 20 },
    })

    assert.equal(client.log.length, 1)
    assert.ok(client.log[ 0 ].sql.includes('UPDATE cargo'))
})

test('cargo.module.exchanged - remove only: no incoming, cargo only grows', async () => {
    const { client, fx } = handlers()

    await fx[ 'cargo.module.exchanged.v1' ]({
        payload: { sid: 's1', pid: 'p1', operation: 'refit_3', incoming: void 0, outgoing: 'cargo.mk1', load: 8, capacity_next: 20 },
    })

    assert.equal(client.log.length, 1)
    assert.ok(client.log[ 0 ].sql.includes('INSERT INTO cargo'))
})
