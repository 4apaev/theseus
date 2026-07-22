import test   from 'node:test'
import assert from 'node:assert/strict'

import { Codec } from '@theseus/util'
import { createMemoryKafka } from '@theseus/kafka'
import { commandTree as CMD, commandTopics, eventTree as EVT } from '@theseus/contracts'

import startPlayer     from '@theseus/player-service'
import startProjection from '@theseus/projection-service'
import startGateway    from '@theseus/gateway'
import { createFrameParser, acceptKey } from '@theseus/ws'

import {
    guid,
    waitFor,
    wsConnect,
} from '#packages/testing/src/index.js?title=🧪 INTEGRATION ⛩️ GATEWAY'

const PRFX = 'itg_gateway'
// ─────────────────────────────────────────────────────────────────────────────

let kafka, player, projection, gateway, base

test.before(async () => {
    kafka      = createMemoryKafka()
    player     = await startPlayer(kafka)
    projection = await startProjection(kafka)
    gateway    = await startGateway(kafka, { port: 0 })
    base       = `http://127.0.0.1:${ gateway.port }`
})

test.after(async () => {
    await gateway?.stop()
    player?.stop()
    projection?.stop()
})

const post = (path, body, headers = {}) => fetch(base + path, {
    method : 'POST',
    body   : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
})

async function registerAndLogin(handle) {
    const reg = await post('/register', { handle, password: 'secret' })
    assert.equal(reg.status, 201)

    const login = await post('/login', { handle, password: 'secret' })
    assert.equal(login.status, 200)
    return login.json()
}

// ── tests ────────────────────────────────────────────────────────────────────

test('register → login → authenticated read of /me through the projection', async () => {
    const handle = guid(PRFX)
    const { token, pid } = await registerAndLogin(handle)
    const bear = { authorization: `Bearer ${ token }` }

    assert.ok(token)
    assert.ok(pid)

    const me = await waitFor(async () => {
        const rs = await fetch(base + '/me', { headers: bear })
        return rs.status === 200 && rs.json()
    })

    assert.equal(me.handle, handle)
    assert.equal(+me.balance, 1000)
})

test('register replies 409 on a taken handle', async () => {
    const handle = guid(PRFX)

    assert.equal((await post('/register', { handle, password: 'x' })).status, 201)

    const dup = await post('/register', { handle, password: 'x' })
    assert.equal(dup.status, 409)
    assert.deepEqual(await dup.json(), { error: 'handle taken' })
})

test('login replies 401 on wrong password', async () => {
    const handle = guid(PRFX)
    assert.equal((await post('/register', { handle, password: 'right' })).status, 201)

    const rs = await post('/login', { handle, password: 'wrong' })
    assert.equal(rs.status, 401)
    assert.deepEqual(await rs.json(), { error: 'invalid credentials' })
})

test('travel command lands in kafka with the pid from the token', async () => {
    const handle = guid(PRFX)
    const { token, pid } = await registerAndLogin(handle)

    const rs = await post('/travel',
        { sid: 's1', from: 'sol.outpost', to: 'barnards.port', pid: 'someone-else' },
        { authorization: `Bearer ${ token }` })

    assert.equal(rs.status, 202)
    const { cmd } = await rs.json()

    const record = kafka.messages(commandTopics.ship)
        .map(m => Codec.decode(m.value))
        .find(c => c.cmd === cmd)

    assert.equal(record.command_type, CMD.ship.travel.requested)
    assert.equal(record.payload.pid, pid)
})

test('command routes without a token reply 401', async () => {
    const rs = await post('/travel', { sid: 's1', from: 'a', to: 'b' })
    assert.equal(rs.status, 401)
})

// ── websocket ────────────────────────────────────────────────────────────────

test('ws feed pushes this player\'s events and only theirs', async () => {
    const mine   = guid(PRFX)
    const theirs = guid(PRFX)

    const me    = await registerAndLogin(mine)
    const other = await registerAndLogin(theirs)

    const { rs, socket } = await wsConnect(gateway.port, `?token=${ me.token }`)
    assert.equal(rs.statusCode, 101)
    assert.equal(rs.headers[ 'sec-websocket-accept' ], acceptKey('dGhlIHNhbXBsZSBub25jZQ=='))

    const received = []
    const parser   = createFrameParser(f => received.push(Codec.decode(f.payload)))
    socket.on('data', chunk => parser.push(chunk))

    // wallet.credited events flow player-service → outbox → kafka → ws
    await kafka.publish({
        topic   : commandTopics.wallet,
        messages: [{ key: other.pid, value: Codec.encode({
            cmd           : guid('cmd'),
            command_type  : CMD.wallet.credit.requested,
            requested     : (new Date).toISOString(),
            requested_by  : 'spec',
            correlation_id: guid('corr'),
            payload       : { pid: other.pid, rfid: guid('rfid'), amount: 5, reason: 'noise' },
        }) }],
    })

    await kafka.publish({
        topic   : commandTopics.wallet,
        messages: [{ key: me.pid, value: Codec.encode({
            cmd           : guid('cmd'),
            command_type  : CMD.wallet.credit.requested,
            requested     : (new Date).toISOString(),
            requested_by  : 'spec',
            correlation_id: guid('corr'),
            payload       : { pid: me.pid, rfid: guid('rfid'), amount: 42, reason: 'reward' },
        }) }],
    })

    const credited = e => e.event_type === EVT.wallet.credited
    await waitFor(() => received.some(credited), '10s')

    const events = received.filter(credited)
    assert.ok(events.every(e => e.payload.pid === me.pid), 'only own events pushed')
    assert.equal(+events[ 0 ].payload.amount, 42)
    socket.destroy()
})

test('ws upgrade with a bad token replies 401', async () => {
    const { rs } = await wsConnect(gateway.port, '?token=garbage')
    assert.equal(rs.statusCode, 401)
})
