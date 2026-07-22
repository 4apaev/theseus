/* eslint-disable camelcase */

import test   from 'node:test'
import assert from 'node:assert/strict'

import Sync from 'garage/sync'

import { create } from '@theseus/auth'
import { Codec, echo } from '@theseus/util'
import { acceptKey, createFrameParser } from '@theseus/ws'
import {
    createEmitter,
    createMemoryKafka,
    decodeTopicMessage,
} from '@theseus/kafka'

import {
    eventTree as EVT,
    commandTree as CMD,
    commandTopics,
} from '@theseus/contracts'

import start             from '#gateway/main.js'
import { createReplies } from '#gateway/replies.js'

import {
    fakePool,
    waitFor,
    wsConnect,
} from '#testing/index.js?title=🧪 ⛩️ GATEWAY'

const SECRET = 'test-secret'
const jwt    = create(SECRET)
const emit   = createEmitter('player-fake')

// in-process stand-in for player-service: replies to register / login
function fakePlayerService(kafka) {
    kafka.subscribe({
        groupId: 'player-fake',
        topics : [ commandTopics.player ],

        async handler(msg) {
            const { value: cmd } = decodeTopicMessage(msg)
            const { correlation_id, cmd: causation_id, payload: p } = cmd

            if (cmd.command_type === CMD.player.register.requested) {
                const taken = p.handle === 'taken'

                await kafka.publish(emit(taken
                    ? EVT.player.registration.rejected
                    : EVT.player.created, {
                    correlation_id,
                    causation_id,
                    aggregate_id  : taken ? p.handle : 'p1',
                    aggregate_type: 'player',
                    payload       : taken
                        ? { handle: p.handle, reason: 'handle taken' }
                        : { pid: 'p1', handle: p.handle },
                }))
            }
            else if (cmd.command_type === CMD.player.login.requested) {
                const ok = p.password === 'secret'

                await kafka.publish(emit(ok
                    ? EVT.player.login.succeeded
                    : EVT.player.login.rejected, {
                    correlation_id,
                    causation_id,
                    aggregate_id  : ok ? 'p1' : p.handle,
                    aggregate_type: 'player',
                    payload       : ok
                        ? { pid: 'p1', handle: p.handle }
                        : { handle: p.handle, reason: 'invalid credentials' },
                }))
            }
        },
    })
}

function projectionPool() {
    return fakePool({
        'FROM players'      : ([      pid ]) => ({ rows: pid === 'p1' ? [{ pid, handle: 'alice', created: 'now', balance: 1000 }] : []}),
        'FROM ships'        : ([      pid ]) => ({ rows: [{ sid: 's1' , pid , status: 'docked' }]}),
        'FROM cargo'        : ([ sid, pid ]) => ({ rows: [{ gid: 'ore', pid , sid, quantity: 5  }]}),
        'FROM market_prices': ([     stid ]) => ({ rows: [{ gid: 'ore', stid, price_buy: 30, price_sell: 25 }]}),
        'FROM trade_history': () => ({ rows: []}),
    })
}

const token = jwt.sign({ pid: 'p1', handle: 'alice' })
const bear  = { authorization: `Bearer ${ token }` } // sync rejects with the parsed payload on non-2xx - .then(echo, echo) settles either way

let kafka, gw

test.before(async () => {
    kafka = createMemoryKafka()
    fakePlayerService(kafka)
    gw    = await start(kafka, { pool: projectionPool(), secret: SECRET, port: 0, timeout: 300 })

    Sync.base = 'http://127.0.0.1:' + gw.port
    Sync.head = new Headers({ 'content-type': 'application/json' })
})

test.after(() => gw.stop())

// ── register / login ────────────────────────────────────────────────────────

test('POST/register replies 201 with the created player', async () => {
    const rs = await Sync.post('/register', { handle: 'alice', password: 'secret' })
    assert.equal(rs.status, 201)
    assert.deepEqual(rs.body, { pid: 'p1', handle: 'alice' })
})

test('POST/register replies 409 when the handle is taken', async () => {
    const rs = await Sync.post('/register', { handle: 'taken', password: 'secret' }).then(echo, echo)
    assert.equal(rs.status, 409)
    assert.deepEqual(rs.body, { error: 'handle taken' })
})

test('POST/register falls back to 202 when no reply arrives', async () => {
    const lonely = createMemoryKafka()          // no player service listening
    const alone  = await start(lonely, { pool: fakePool(), secret: SECRET, port: 0, timeout: 50 })

    try {
        const rs = await Sync.post(
            `http://127.0.0.1:${ alone.port }/register`,
            { handle: 'alice', password: 'x' },
        )

        assert.equal(rs.status, 202)
        assert.ok(rs.body.cmd)
        assert.ok(rs.body.correlation_id)
    }
    finally {
        await alone.stop()
    }
})

test('POST/login returns a verifiable token', async () => {
    const rs = await Sync.post('/login', { handle: 'alice', password: 'secret' })

    assert.equal(rs.status, 200)
    assert.equal(rs.body.pid, 'p1')
    assert.equal(rs.body.handle, 'alice')

    const claims = jwt.verify(rs.body.token)
    assert.equal(claims.pid, 'p1')
})

test('POST/login replies 401 on bad credentials', async () => {
    const rs = await Sync.post('/login', { handle: 'alice', password: 'wrong' }).then(echo, echo)
    assert.equal(rs.status, 401)
    assert.deepEqual(rs.body, { error: 'invalid credentials' })
})

// ── command routes ──────────────────────────────────────────────────────────

test('POST/travel publishes the command with pid from the token, not the body', async () => {
    const rs = await Sync.post('/travel', { sid: 's1', from: 'a', to: 'b', pid: 'evil' }).set(bear)
    assert.equal(rs.status, 202)

    const record = kafka.messages(commandTopics.ship).at(-1)
    const cmd = Codec.decode(record.value)

    assert.equal(cmd.cmd, rs.body.cmd)
    assert.equal(cmd.command_type, CMD.ship.travel.requested)
    assert.equal(cmd.payload.pid, 'p1')
})

test('POST/buy/sell publish market commands', async () => {
    const buy  = await Sync.post('/buy',  { gid: 'ore', sid: 's1', stid: 'st1', quantity: 5, price_unit_max: 30 }).set(bear)
    const sell = await Sync.post('/sell', { gid: 'ore', sid: 's1', stid: 'st1', quantity: 5, price_unit_min: 20 }).set(bear)

    assert.equal(buy.status, 202)
    assert.equal(sell.status, 202)

    const types = kafka.messages(commandTopics.market)
        .map(m => Codec.decode(m.value).command_type)

    assert.ok(types.includes(CMD.market.buy.requested))
    assert.ok(types.includes(CMD.market.sell.requested))
})

test('POST/travel without token replies 401 and publishes nothing', async () => {
    const before = kafka.messages(commandTopics.ship).length
    const rs = await Sync.post('/travel', { sid: 's1', from: 'a', to: 'b' }).then(echo, echo)

    assert.equal(rs.status, 401)
    assert.equal(kafka.messages(commandTopics.ship).length, before)
})

test('POST/travel with invalid payload replies 400 and publishes nothing', async () => {
    const before = kafka.messages(commandTopics.ship).length
    const rs = await Sync.post('/travel', { /* missing sid */ from: 'a', to: 'b' }).set(bear).then(echo, echo)

    assert.equal(rs.status, 400)
    assert.equal(kafka.messages(commandTopics.ship).length, before)
})

test('POST with a broken json body replies 400', async () => {
    const rs = await Sync.post('/travel', 'not json').set(bear).then(echo, echo)
    assert.equal(rs.status, 400)
})

test('unknown route replies 404', async () => {
    const rs = await Sync.get('/nope').set(bear).then(echo, echo)
    assert.equal(rs.status, 404)
})

// ── query routes ────────────────────────────────────────────────────────────

test('GET/me returns player + wallet', async () => {
    const rs = await Sync.get('/me').set(bear)

    assert.equal(rs.status, 200)
    assert.equal(rs.body.handle, 'alice')
    assert.equal(rs.body.balance, 1000)
})

test('GET/me replies 404 when the projection has not caught up', async () => {
    const ghost = { authorization: `Bearer ${ jwt.sign({ pid: 'p2', handle: 'ghost' }) }` }
    const rs = await Sync.get('/me').set(ghost).then(echo, echo)

    assert.equal(rs.status, 404)
})

test('GET/ships /cargo/:sid /market/:stid /trades return projection rows', async () => {
    const { body: [ ships  ] } = await Sync.get('/ships').set(bear)
    const { body: [ cargo  ] } = await Sync.get('/cargo/s1').set(bear)
    const { body: [ market ] } = await Sync.get('/market/st1').set(bear)
    const { body: [ trades ] } = await Sync.get('/trades').set(bear)

    assert.equal(ships.sid, 's1')
    assert.equal(cargo.gid, 'ore')
    assert.equal(market.price_buy, 30)
    assert.equal(trades, void 0)
})

// ── replies waiter ──────────────────────────────────────────────────────────

test('waiter resolves a matching reply', async () => {
    const waiter  = createReplies(100)
    const pending = waiter.wait('c1', [ 'a.v1', 'b.v1' ])

    assert.equal(waiter.settle({ correlation_id: 'c1', event_type: 'b.v1' }), true)
    assert.equal((await pending).event_type, 'b.v1')
    assert.equal(waiter.size, 0)
})

test('waiter ignores wrong correlation or type', async () => {
    const waiter  = createReplies(30)
    const pending = waiter.wait('c1', [ 'a.v1' ])

    assert.equal(waiter.settle({ correlation_id: 'zz', event_type: 'a.v1' }), false)
    assert.equal(waiter.settle({ correlation_id: 'c1', event_type: 'b.v1' }), false)
    assert.equal(await pending, undefined)                    // times out
})

test('waiter resolves undefined on timeout and cleans up', async () => {
    const waiter = createReplies('10')
    assert.equal(await waiter.wait('c1', [ 'a.v1' ]), undefined)
    assert.equal(waiter.size, 0)
})

// ── websocket feed ──────────────────────────────────────────────────────────
// createFeed's own composition: jwt → authenticate wiring, pid-filtered
// routing, price broadcast. protocol mechanics (handshake, frame codec,
// keepalive) are @theseus/ws's job and live in test/ws.spec.js

test('ws upgrade handshakes with a valid token', async () => {
    const { rs, socket } = await wsConnect(gw.port, `?token=${ token }`)

    assert.equal(rs.statusCode, 101)
    assert.equal(rs.headers[ 'sec-websocket-accept' ], acceptKey('dGhlIHNhbXBsZSBub25jZQ=='))
    socket.destroy()
})

test('ws upgrade rejects a bad token with 401', async () => {
    const { rs, socket } = await wsConnect(gw.port, '?token=nope')
    assert.equal(rs.statusCode, 401)
    socket?.destroy()
})

test('ws pushes events for the socket pid and filters others out', async () => {
    const { socket } = await wsConnect(gw.port, `?token=${ token }`)
    const received   = []
    const parser     = createFrameParser(f => received.push(Codec.decode(f.payload)))
    socket.on('data', chunk => parser.push(chunk))

    const wallet = pid => emit(EVT.wallet.credited, {
        aggregate_id  : pid,
        aggregate_type: 'wallet',
        payload       : { pid, rfid: 'r1', amount: 10, balance: 1010 },
    })

    await kafka.publish(wallet('p2'))              // someone else
    await kafka.publish(wallet('p1'))              // ours

    await waitFor(() => received.length)

    assert.equal(received.length, 1)
    assert.equal(received[ 0 ].event_type, EVT.wallet.credited)
    assert.equal(received[ 0 ].payload.pid, 'p1')
    socket.destroy()
})

test('ws broadcasts market price changes to everyone', async () => {
    const { socket } = await wsConnect(gw.port, `?token=${ token }`)
    const received   = []
    const parser     = createFrameParser(f => received.push(Codec.decode(f.payload)))
    socket.on('data', chunk => parser.push(chunk))

    await kafka.publish(emit(EVT.market.price.changed, {
        aggregate_id  : 'st1',
        aggregate_type: 'market',
        payload       : { gid: 'ore', stid: 'st1', price_buy: 31, price_sell: 26 },
    }))

    await waitFor(() => received.length)
    assert.equal(received[ 0 ].event_type, EVT.market.price.changed)
    socket.destroy()
})
