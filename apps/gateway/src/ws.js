import { createHash, randomBytes } from 'node:crypto'
import { Codec, formatTime       } from '@theseus/util'
import { eventTree as EVT        } from '@theseus/contracts'

/*  the fixed guid from rfc 6455 - every websocket server uses this
    exact string. the handshake echoes base64(sha1(client key + MAGIC))
    back as sec-websocket-accept: not auth, a liveness proof - nothing
    that doesn't specifically speak websocket would know to do this,
    so a naive http server / cache / proxy can't accidentally accept
    an upgrade by echoing headers */
export const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export const OP = {
    cont : 0x0,
    text : 0x1,
    bin  : 0x2,
    close: 0x8,
    ping : 0x9,
    pong : 0xA,
}

// rfc 6455 §4.2.2 - the client kills the connection unless
// the 101 carries exactly this value for its sec-websocket-key
export function acceptKey(key) {
    return createHash('sha1')
        .update(key + MAGIC)
        .digest('base64')
}

// ── frame codec ──────────────────────────────────────────────

export function encodeFrame(payload, {
    opcode = OP.text,
    mask = false,
} = {}) {

    const data = Buffer.from(
        Buffer.isBuffer(payload)
            ? payload
            : String(payload),
    )

    const n = data.length
    const head = Buffer.alloc(
        n < 126
            ? 2
            : n < 0x10000       // 65536
                ? 4
                : 10)

    head[ 0 ] = 0x80 | opcode   // fin, no fragments
    if (n < 126) {
        head[ 1 ] = n
    }
    else if (n < 0x10000) {
        head[ 1 ] = 126
        head.writeUInt16BE(n, 2)
    }
    else {
        head[ 1 ] = 127
        head.writeBigUInt64BE(BigInt(n), 2)
    }

    if (!mask)
        return Buffer.concat([ head, data ])

    head[ 1 ] |= 0x80

    const key = randomBytes(4)
    for (let i = n; i--;)
        data[ i ] ^= key[ i % 4 ]

    return Buffer.concat([ head, key, data ])
}

/**
 * @typedef { Object  } Frame
 * @prop    { Buffer  } payload
 * @prop    { boolean } masked
 * @prop    { boolean } fin
 * @prop    { number  } size
 * @prop    { number  } opcode
 */

/**
 * @description
 *      stateful: accumulates partial tcp chunks, emits complete frames
 *
 * @param  {(frame: Frame) => unknown} onFrame
 * @return {{ push: (chunk: Buffer) => void }}
 */
export function createFrameParser(onFrame) {
    let buf = Buffer.alloc(0)

    return {
        push(chunk) {
            buf = buf.length
                ? Buffer.concat([ buf, chunk ])
                : Buffer.from(chunk)

            let frame
            while (frame = readFrame(buf)) {
                buf = buf.subarray(frame.size)
                onFrame(frame)
            }
        },
    }
}

function readFrame(buf) {
    if (buf.length < 2)
        return

    const opcode =    buf[ 0 ] & 0x0f  // 15
    const fin    = !!(buf[ 0 ] & 0x80) // 128
    const masked = !!(buf[ 1 ] & 0x80) // 128
    let n        =    buf[ 1 ] & 0x7f  // 127
    let off = 2

    if (n === 126) {                   // 0x7e
        if (buf.length < 4) return

        n   = buf.readUInt16BE(2)
        off = 4
    }
    else if (n === 127) {              // 0x7f
        if (buf.length < 10) return

        n   = Number(buf.readBigUInt64BE(2))
        off = 10
    }

    const size = n + off + (masked ? 4 : 0)
    if (buf.length < size) return

    let payload
    if (masked) {
        const key = buf.subarray(off, off + 4)
        payload = Buffer.from(buf.subarray(off + 4, size))

        for (let i = n; i--;)
            payload[ i ] ^= key[ i % 4 ]
    }
    else {
        payload = Buffer.from(buf.subarray(off, size))
    }

    return { fin, opcode, masked, payload, size }
}

// ── server ───────────────────────────────────────────────────

/**
 * @description
 *      push-only feed: jwt in ?token= checked before the 101
 *      (browsers cannot set headers on WebSocket),
 *      sockets keyed by pid,
 *      events with payload.pid go to that player,
 *      price changes broadcast
 */
export function createWss({ jwt, ping = '30s' } = {}) {
    const connections = new Map                       // socket → { pid, alive, closed }
    const tid   = setInterval(heartbeat, formatTime(ping))
    tid.unref?.()

    function reject(soc, status) {
        soc.write(`HTTP/1.1 ${ status }\r\n\r\n`)
        soc.destroy()
    }

    function handleUpgrade(rq, soc) {
        let claims
        try {
            const token = new URL(rq.url, 'http://gateway').searchParams.get('token')
            claims = jwt.verify(token)
        }
        catch {
            return reject(soc, '401 Unauthorized')
        }

        const key = rq.headers[ 'sec-websocket-key' ]
        if (rq.headers.upgrade?.toLowerCase() !== 'websocket' || !key)
            return reject(soc, '400 Bad Request')

        soc.write([
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${ acceptKey(key) }`,
            '\r\n',
        ].join('\r\n'))

        const con = { pid: claims.pid, alive: true, closed: false }
        connections.set(soc, con)

        const parser = createFrameParser(frame => {
            if (!frame.masked || !frame.fin)                 // client frames must be masked, whole
                return close(soc, 1002)

            switch (frame.opcode) {
                case OP.ping : return soc.write(encodeFrame(frame.payload, { opcode: OP.pong }))
                case OP.pong : return con.alive = true
                case OP.close: return close(soc, 1000)
                case OP.text : return                        // push-only, client text ignored
                default      : return close(soc, 1003)
            }
        })

        soc.on('data', chunk => parser.push(chunk))
        soc.on('error', () => drop(soc))
        soc.on('close', () => connections.delete(soc))
    }

    function close(soc, code) {
        const con = connections.get(soc)
        if (con && !con.closed) {
            con.closed = true
            const status = Buffer.alloc(2)
            status.writeUInt16BE(code)
            soc.write(encodeFrame(status, { opcode: OP.close }))
        }
        drop(soc)
    }

    function drop(soc) {
        connections.delete(soc)
        soc.destroy()
    }

    function send(soc, frame) {
        connections.get(soc)?.closed || soc.write(frame)
    }

    function heartbeat() {
        for (const [ soc, con ] of connections) {
            if (!con.alive) {
                drop(soc)
                continue
            }
            con.alive = false
            soc.write(encodeFrame(Buffer.alloc(0), { opcode: OP.ping }))
        }
    }

    return {
        handleUpgrade,
        push(e) {
            const frame = encodeFrame(Codec.encode({
                correlation_id: e.correlation_id,
                event_type    : e.event_type,
                occurred      : e.occurred,
                payload       : e.payload,
            }))

            const pid = e?.payload?.pid
            for (const [ soc, con ] of connections) {
                if (pid
                    ? con.pid === pid
                    : e.event_type === EVT.market.price.changed)
                    send(soc, frame)
            }
        },
        stats() {
            return { sockets: connections.size }
        },
        close() {
            clearInterval(tid)
            for (const socket of connections.keys())
                close(socket, 1001)
        },
    }
}
