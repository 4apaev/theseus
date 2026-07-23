import test   from 'node:test'
import assert from 'node:assert/strict'
import Http   from 'node:http'

import {
    OP,
    acceptKey,
    encodeFrame,
    createWss,
    createFrameParser,
} from '@theseus/ws'

import {
    waitFor,
    wsConnect,
} from '#testing/index.js?title=🧪 🚾 WS'

// ── frame codec ──────────────────────────────────────────────────────────────

/*  known-answer test: the worked example published in rfc 6455 §1.3 -
    key base64("the sample nonce") must hash to exactly this accept.
    pins the sha1 + MAGIC + base64 chain: wrong digest, swapped
    concatenation or a typo'd guid fails here, no sockets involved */
test('acceptKey matches the rfc 6455 sample', () => {
    assert.equal(acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=')
})

test('frame codec roundtrips short, medium and long payloads', () => {
    for (const n of [ 5, 300, 70000 ]) {
        const payload = 'x'.repeat(n)
        const frames  = []
        createFrameParser(f => frames.push(f)).push(encodeFrame(payload))

        assert.equal(frames.length, 1)
        assert.equal(frames[ 0 ].opcode, OP.text)
        assert.equal(frames[ 0 ].payload.toString(), payload)
        assert.ok(frames[ 0 ].fin)
    }
})

test('frame parser unmasks client frames', () => {
    const frames = []
    createFrameParser(f => frames.push(f)).push(encodeFrame('hello', { mask: true }))

    assert.equal(frames[ 0 ].masked, true)
    assert.equal(frames[ 0 ].payload.toString(), 'hello')
})

test('frame parser survives byte-at-a-time delivery', () => {
    const frames = []
    const parser = createFrameParser(f => frames.push(f))
    const wire   = encodeFrame('sliced', { mask: true })

    for (const byte of wire)
        parser.push(Buffer.from([ byte ]))

    assert.equal(frames.length, 1)
    assert.equal(frames[ 0 ].payload.toString(), 'sliced')
})

test('frame parser emits multiple frames from one chunk', () => {
    const frames = []
    createFrameParser(f => frames.push(f)).push(Buffer.concat([
        encodeFrame('one'),
        encodeFrame('two'),
    ]))

    assert.deepEqual(frames.map(f => f.payload.toString()), [ 'one', 'two' ])
})

// ── createWss ────────────────────────────────────────────────────────────────

function serve(wss) {
    const server = Http.createServer((rq, rs) => rs.writeHead(404).end())
    server.on('upgrade', (rq, socket) => wss.handleUpgrade(rq, socket))
    return new Promise(done => server.listen(0, () => done(server)))
}

// http.Server#close() waits for every socket to drain, including
// hijacked upgrade sockets - a client-side destroy() doesn't always
// propagate fast enough, so force it like gateway's own main.js does
function stop(server) {
    return new Promise(done => {
        server.close(done)
        server.closeAllConnections()
    })
}

let server, wss, anonServer, anon

test.before(async () => {
    wss    = createWss({ authenticate: rq => ({ token: new URL(rq.url, 'http://x').searchParams.get('token') }) })
    server = await serve(wss)

    anon       = createWss()               // no authenticate - default anonymous path
    anonServer = await serve(anon)
})

test.after(() => Promise.all([ stop(server), stop(anonServer) ]))

test('upgrades without an authenticate hook (anonymous by default)', async () => {
    const { rs, socket } = await wsConnect(anonServer.address().port)
    assert.equal(rs.statusCode, 101)

    let meta
    anon.each(m => meta = m)
    assert.equal(meta, undefined)
    socket.destroy()
})

test('rejects the upgrade with 401 when authenticate throws', async () => {
    const guarded = createWss({ authenticate() { throw new Error('nope') } })
    const server  = await serve(guarded)

    try {
        const { rs, socket } = await wsConnect(server.address().port)
        assert.equal(rs.statusCode, 401)
        socket?.destroy()
    }
    finally {
        await stop(server)
    }
})

test('rejects with 400 on a malformed upgrade request', async () => {
    const { rs, socket } = await wsConnect(server.address().port, '', { upgrade: 'chat' })
    assert.equal(rs.statusCode, 400)
    socket?.destroy()
})

test('each() exposes the authenticate() result per connection', async () => {
    const { socket } = await wsConnect(server.address().port, '?token=abc')

    const metas = []
    wss.each(m => metas.push(m))

    assert.deepEqual(metas.at(-1), { token: 'abc' })
    socket.destroy()
})

test('answers ping with pong and close with close', async () => {
    const { socket } = await wsConnect(server.address().port)
    const frames = []
    const parser = createFrameParser(f => frames.push(f))
    socket.on('data', chunk => parser.push(chunk))

    socket.write(encodeFrame('marco', { opcode: OP.ping, mask: true }))
    await waitFor(() => frames.length)

    assert.equal(frames[ 0 ].opcode, OP.pong)
    assert.equal(frames[ 0 ].payload.toString(), 'marco')

    socket.write(encodeFrame(Buffer.alloc(0), { opcode: OP.close, mask: true }))
    await waitFor(() => frames.some(f => f.opcode === OP.close))
})

test('closes the connection on an unmasked client frame', async () => {
    const { socket } = await wsConnect(server.address().port)
    const closed = new Promise(done => socket.on('close', done))

    socket.resume()                        // paused upgrade socket never sees the fin
    socket.write(encodeFrame('cheat', { mask: false }))
    await closed
    assert.ok(true)
})

test('heartbeat drops a silent connection', async () => {
    const beat   = createWss({ ping: 40 })
    const server = await serve(beat)

    try {
        const { socket } = await wsConnect(server.address().port)
        const closed = new Promise(done => socket.on('close', done))
        socket.resume()

        await waitFor(() => beat.stats().sockets === 1)
        await closed                                   // no pong sent → dropped
        await waitFor(() => beat.stats().sockets === 0)
    }
    finally {
        beat.close()
        await stop(server)
    }
})
