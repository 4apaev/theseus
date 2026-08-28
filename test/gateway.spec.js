/* eslint-disable camelcase */

import test   from 'node:test'
import assert from 'node:assert/strict'

import Sync from 'garage/sync'

import { create } from '@theseus/auth'
import { TIME_SCALE, universe } from '@theseus/domain'
import { Codec, echo } from '@theseus/util'
import { acceptKey, createFrameParser } from 'garage/mw/ws'
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
import { seesAll       } from '#gateway/feed.js'

import {
    waitFor,
    wsConnect,
    fakeTablePool,
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
                        ? { pid: 'p1', handle: p.handle, role: 'player' }
                        : { handle: p.handle, reason: 'invalid credentials' },
                }))
            }
        },
    })
}

const TRAFFIC = [
    { sid: 's1', handle: 'alice', name: 'Argo', status: 'docked',
        stid: 'st1', from: null, to: null, arrives: null, arrived: 'now', years_abs: null },
    { sid: 's2', handle: 'bob', name: 'Nostromo', status: 'transit',
        stid: null, from: 'st1', to: 'st2', arrives: 'later', arrived: null, years_abs: 2 },
]

function projectionPool() { /*
    keyed by the tables, both reach `ships`,
    but only traffic() also joins `players`,
    so the 2 never collide. fakeTablePool parses the table names
 */ return fakeTablePool({
        'players+wallets': ([      pid ]) => ({ rows: pid === 'p1' ? [{ pid, handle: 'alice', created: 'now', balance: 1000 }] : []}),
        'players+ships'  : ([     stid ]) => ({ rows: stid ? [ TRAFFIC[ 0 ] ] : TRAFFIC }),
        'cargo+ships'    : ([ sid, pid ]) => ({ rows: [{ gid: 'ore', pid , sid, quantity: 5  }]}),
        ships            : ([      pid ]) => ({ rows: [{ sid: 's1' , pid , status: 'docked' }]}),
        market_prices    : ([     stid ]) => ({ rows: [{ gid: 'ore', stid, price_buy: 30, price_sell: 25 }]}),
        trade_history    : () => ({ rows: []}),
    })
}

const token = jwt.sign({ pid: 'p1', handle: 'alice' })
const bear  = { authorization: `Bearer ${ token }` } // sync rejects with the parsed payload on non-2xx - .then(echo, echo) settles either way

const adminToken = jwt.sign({ pid: 'admin1', handle: 'root', role: 'admin' })
const adminBear  = { authorization: `Bearer ${ adminToken }` }

const otherToken = jwt.sign({ pid: 'p2', handle: 'bob' }) // another player, for traffic tests

let kafka, gw, pool

test.before(async () => {
    kafka = createMemoryKafka()
    fakePlayerService(kafka)
    pool  = projectionPool()
    gw    = await start(kafka, { pool, secret: SECRET, port: 0, timeout: 300 })

    Sync.base = 'http://127.0.0.1:' + gw.port
    Sync.head.set('content-type', 'application/json')
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
    const alone  = await start(lonely, { pool: fakeTablePool(), secret: SECRET, port: 0, timeout: 50 })

    const url = `http://127.0.0.1:${ alone.port }/register`
    const body = { handle: 'alice', password: 'x' }
    try {
        const rs = await Sync.post(url, body)
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
    assert.equal(rs.body.role, 'player')

    const claims = jwt.verify(rs.body.token)
    assert.equal(claims.pid, 'p1')
    assert.equal(claims.role, 'player')
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
    const data = { gid: 'ore', sid: 's1', stid: 'st1', quantity: 5 }
    const buy  = await Sync.post('/buy',  { ...data, price_unit_max: 30 }).set(bear)
    const sell = await Sync.post('/sell', { ...data, price_unit_min: 20 }).set(bear)

    assert.equal(buy.status, 202)
    assert.equal(sell.status, 202)

    const types = kafka.messages(commandTopics.market)
        .map(m => Codec.decode(m.value).command_type)

    assert.ok(types.includes(CMD.market.buy.requested))
    assert.ok(types.includes(CMD.market.sell.requested))
})

test('POST/rename publishes the command with the pid from the token', async () => {
    const rs = await Sync.post('/rename', { sid: 's1', name: 'Argo', pid: 'evil' }).set(bear)
    assert.equal(rs.status, 202)

    const cmd = kafka.messages(commandTopics.ship)
        .map(m => decodeTopicMessage({ value: m.value }).value)
        .find(c => c.cmd === rs.body.cmd)

    assert.equal(cmd.command_type, CMD.ship.rename.requested)
    assert.equal(cmd.payload.name, 'Argo')
    assert.equal(cmd.payload.pid, 'p1', 'the body pid is ignored')
})

test('POST/rename replies 400 on a name the contract refuses', async () => {
    const rs = await Sync.post('/rename', { sid: 's1', name: 'a'.repeat(25) }).set(bear).then(echo, echo)
    assert.equal(rs.status, 400)
    assert.match(rs.body.error, /name/)
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

// ── public: client + universe ───────────────────────────────────────────────

test('GET/ serves the client html without a token', async () => {
    const rs = await Sync.get('/')

    assert.equal(rs.status, 200)
    assert.match(rs.head.get('content-type'), /text\/html/)
    assert.match(rs.body, /theseus/i)
})

test('GET/pub/:file serves clientPath\'s directory (css/js/img) without a token', async () => {
    const css = await Sync.get('/pub/css/style.css')
    const js  = await Sync.get('/pub/js/app.js')

    assert.equal(css.status, 200)
    assert.match(css.head.get('content-type'), /text\/css/)
    assert.match(css.body, /:root/)

    assert.equal(js.status, 200)
    assert.match(js.head.get('content-type'), /javascript/)
    assert.match(js.body, /addEventListener/)
})

test('GET/pub/:file serves the full client module graph, e.g. session.js', async () => {
    const rs = await Sync.get('/pub/js/session.js')

    assert.equal(rs.status, 200)
    assert.match(rs.head.get('content-type'), /javascript/)
    assert.match(rs.body, /function register/)
})

test('GET/pub/:file rejects path traversal outside the client dir', async () => {
    const rs = await Sync.get('/pub/..%2fpackage.json').then(echo, echo)
    assert.equal(rs.status, 404)
})

test('GET/universe returns the serialized graph without a token', async () => {
    const rs = await Sync.get('/universe')

    assert.equal(rs.status, 200)
    assert.equal(rs.body.systems.length, universe.systems.size)
    assert.equal(rs.body.stations.length, universe.nodes.size)
    assert.ok(rs.body.routes.length >= rs.body.stations.length, 'both directions of every link')
    assert.ok(rs.body.routes.every(r => r.ly > 0 && r.c > 0))
    assert.equal(rs.body.goods.ore.name, 'iron ore')
    assert.equal(rs.body.starter.stid, 'sol.outpost')
    assert.equal(rs.body.constants.time_scale, TIME_SCALE)
})

test('GET/garage/:file serves garage\'s browser-safe source without a token', async () => {
    const rs = await Sync.get('/garage/util.js')

    assert.equal(rs.status, 200)
    assert.match(rs.head.get('content-type'), /javascript/)
    assert.match(rs.body, /export function/)
})

test('GET/garage/:file rejects path traversal outside garage\'s src dir', async () => {
    const rs = await Sync.get('/garage/..%2f..%2fpackage.json').then(echo, echo)
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

// a good sold down to 0 stays a cargo row, not a deleted one - the
// query must filter it out itself, hydrate can't rely on the live
// socket path (mutateCargo() in events.js) to hide it for a fresh load
test('GET /cargo/:sid excludes zero-quantity rows at the query level', async () => {
    await Sync.get('/cargo/s1').set(bear)
    const cargo = pool.client.log.find(({ sql }) => sql.includes('FROM cargo'))
    assert.match(cargo.sql, /quantity > 0/)
})

// ── public ship traffic ──────────────────────────────────────────────────────

test('GET/traffic needs a token - public means signed in, not anonymous', async () => {
    const rs = await Sync.get('/traffic').then(echo, echo)
    assert.equal(rs.status, 401)
})

test('GET/traffic returns every ship, by handle, never by pid', async () => {
    const { body } = await Sync.get('/traffic').set(bear)

    assert.equal(body.length, 2)
    assert.deepEqual(body.map(t => t.handle), [ 'alice', 'bob' ])
    assert.ok(body.every(t => !('pid' in t)), 'pid never reaches another player')

    const transit = body.find(t => t.status === 'transit')
    assert.equal(transit.stid, null, 'a ship in transit is at no station')
    assert.equal(transit.to, 'st2')
})

test('GET/station/:stid/ships filters by station', async () => {
    const { body } = await Sync.get('/station/st1/ships').set(bear)

    assert.equal(body.length, 1)
    assert.equal(body[ 0 ].handle, 'alice')
    assert.deepEqual(pool.client.log.at(-1).params, [ 'st1' ], 'stid is bound, not spliced')
})

test('both traffic routes run the same sql', async () => {
    await Sync.get('/traffic').set(bear)
    await Sync.get('/station/st1/ships').set(bear)

    const [ fleet, station ] = pool.client.log
        .filter(q => q.sql.includes('JOIN players p'))
        .slice(-2)
        .map(q => q.sql)

    assert.equal(fleet, station, 'one query, two routes - they cannot disagree')
})

// ── admin routes ─────────────────────────────────────────────────────────────

test('GET/admin/players without the admin role replies 403', async () => {
    const rs = await Sync.get('/admin/players').set(bear).then(echo, echo)
    assert.equal(rs.status, 403)
})

test('admin routes: players, events, inventory, rebuild', async () => {
    const pool = fakeTablePool({
        'players+wallets'          : () => ({ rows: [{ pid: 'p1', handle: 'alice', created: 'now', balance: 1000 }]}),
        event_log                  : () => ({ rows: [{ eid: 'e1', event_type: 'player.created.v1', payload: {}, occurred: 'now', received: 'now' }]}),
        'market.station_inventory' : () => ({ rows: [{ gid: 'ore', stock: 160, target: 100, updated: 'now' }]}),
    })
    const rebuild = async () => 3
    const admin   = await start(createMemoryKafka(), { pool, secret: SECRET, port: 0, rebuild })
    const base    = `http://127.0.0.1:${ admin.port }`

    try {
        const players   = await Sync.get(`${ base }/admin/players`).set(adminBear)
        const events    = await Sync.get(`${ base }/admin/events`).set(adminBear)
        const inventory = await Sync.get(`${ base }/admin/inventory/sol.outpost`).set(adminBear)
        const rebuilt   = await Sync.post(`${ base }/admin/rebuild`, {}).set(adminBear)

        assert.deepEqual(players.body, [{ pid: 'p1', handle: 'alice', created: 'now', balance: 1000 }])
        assert.equal(events.body[ 0 ].event_type, 'player.created.v1')
        assert.equal(inventory.body[ 0 ].gid, 'ore')
        assert.deepEqual(rebuilt.body, { replayed: 3 })
    }
    finally {
        await admin.stop()
    }
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
// keepalive) are garage/mw/ws's job - tested in its own repo, not here

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

test('ws admin socket skips the pid filter - full firehose', async () => {
    const { socket } = await wsConnect(gw.port, `?token=${ adminToken }`)
    const received   = []
    const parser     = createFrameParser(f => received.push(Codec.decode(f.payload)))
    socket.on('data', chunk => parser.push(chunk))

    await kafka.publish(emit(EVT.wallet.credited, {
        aggregate_id  : 'p2',
        aggregate_type: 'wallet',
        payload       : { pid: 'p2', rfid: 'r1', amount: 10, balance: 1010 }, // not admin1's
    }))

    await waitFor(() => received.length)
    assert.equal(received[ 0 ].payload.pid, 'p2')
    socket.destroy()
})

// ── ship traffic on the socket ───────────────────────────────────────────────

// seesAll is the access rule - test it alone, not only through a socket
test('seesAll: admin and the owner see all, a stranger does not', () => {
    const owner    = { pid: 'p1' }
    const stranger = { pid: 'p2' }
    const admin    = { pid: 'a1', role: 'admin' }

    assert.equal(seesAll(owner, 'p1'), true, 'the owner')
    assert.equal(seesAll(stranger, 'p1'), false, 'a stranger')
    assert.equal(seesAll(admin, 'p1'), true, 'an admin')

    // an event with no pid must not leak to a socket with no pid
    assert.equal(seesAll({}, void 0), false, 'undefined never equals undefined here')
})

// listen on 2 sockets at once: the owner, and another player
async function twoSockets() {
    const rx = t => wsConnect(gw.port, `?token=${ t }`).then(({ socket }) => {
        const got = []
        const parser = createFrameParser(f => got.push(Codec.decode(f.payload)))
        socket.on('data', chunk => parser.push(chunk))
        return { socket, got }
    })
    return { own: await rx(token), other: await rx(otherToken) }
}

test('ws sends ship movement to everyone, but the pid only to the owner', async () => {
    const { own, other } = await twoSockets()

    const trip = {
        sid: 's1', pid: 'p1', from: 'st1', to: 'st2',
        arrives  : (new Date).toISOString(),
        departed : (new Date).toISOString(),
        years_abs: 7, years_rel: 5,
    }

    await kafka.publish(emit(EVT.ship.departed, {
        aggregate_id: 's1', aggregate_type: 'ship', payload: trip,
    }))

    await waitFor(() => own.got.length && other.got.length)

    const mine = own.got[ 0 ]
    assert.equal(mine.payload.pid, 'p1', 'the owner keeps the pid')
    assert.equal(mine.payload.years_rel, 5, 'the owner keeps their own proper time')

    const theirs = other.got[ 0 ]
    assert.equal(theirs.event_type, EVT.ship.departed)
    assert.equal(theirs.payload.sid, 's1', 'a stranger gets the ship id')
    assert.equal(theirs.payload.to, 'st2')
    assert.equal(theirs.payload.years_abs, 7, 'and enough to move the marker')
    assert.equal(theirs.payload.pid, void 0, 'but never the pid')
    assert.equal(theirs.payload.years_rel, void 0, 'and never the proper time')
    assert.equal(theirs.correlation_id, void 0, 'and no correlation_id')

    own.socket.destroy()
    other.socket.destroy()
})

test('ws sends ship created and arrived to everyone, without the pid', async () => {
    const { own, other } = await twoSockets()

    await kafka.publish(emit(EVT.ship.created, {
        aggregate_id: 's1', aggregate_type: 'ship',
        payload: { sid: 's1', pid: 'p1', stid: 'st1', name: 'Argo', capacity: 20, velocity: 0.6 },
    }))
    await kafka.publish(emit(EVT.ship.arrived, {
        aggregate_id: 's1', aggregate_type: 'ship',
        payload: { sid: 's1', pid: 'p1', stid: 'st2', arrived: (new Date).toISOString() },
    }))

    await waitFor(() => other.got.length === 2)

    const [ made, docked ] = other.got
    assert.equal(made.payload.name, 'Argo')
    assert.equal(made.payload.pid, void 0)
    assert.equal(made.payload.capacity, void 0, 'capacity stays private')
    assert.equal(docked.payload.stid, 'st2')
    assert.equal(docked.payload.pid, void 0)

    own.socket.destroy()
    other.socket.destroy()
})

test('ws keeps a travel rejection private', async () => {
    const { own, other } = await twoSockets()

    await kafka.publish(emit(EVT.ship.travel.rejected, {
        aggregate_id: 's1', aggregate_type: 'ship',
        payload: { sid: 's1', pid: 'p1', reason: 'ship not at origin' },
    }))

    await waitFor(() => own.got.length)
    assert.equal(own.got[ 0 ].payload.reason, 'ship not at origin')
    assert.equal(other.got.length, 0, 'a failure is nobody else\'s business')

    own.socket.destroy()
    other.socket.destroy()
})
