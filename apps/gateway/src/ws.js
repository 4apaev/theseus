import { createHash, randomBytes } from 'node:crypto'
import { Codec, formatTime       } from '@theseus/util'
import { eventTree as EVT        } from '@theseus/contracts'                   /*
                                                                                *
    rfc 6455 in ~250 lines.                                                     *
    -----------------------------------------------------------------------------
                                                                                *
    a websocket starts life as a plain http GET:                                *
                                                                                *
        GET /?token=... HTTP/1.1                                                *
        Connection: Upgrade                                                     *
        Upgrade: websocket                                                      *
        Sec-WebSocket-Key: <16 random bytes, base64>                            *
                                                                                *
    the server answers `101 Switching Protocols` (handleUpgrade below)          *
    and from that moment the tcp socket stops being http: both sides            *
    exchange binary FRAMES (encodeFrame / readFrame), full duplex,              *
    until a close frame or the socket dies.                                     *
                                                                                *
    three layers here:                                                          *
        handshake   - acceptKey + handleUpgrade                                 *
        frame codec - encodeFrame + createFrameParser (pure, no sockets)        *
        the server  - createWss: socket registry, keepalive, per-pid fanout     *
                                                                                *
    -----------------------------------------------------------------------------
                                                                                *
    the fixed guid from rfc 6455 - every websocket server uses this             *
    exact string. the handshake echoes base64(sha1(client key + MAGIC))         *
    back as sec-websocket-accept: not auth, a liveness proof - nothing          *
    that doesn't specifically speak websocket would know to do this,            *
    so a naive http server / cache / proxy can't accidentally accept            *
    an upgrade by echoing headers                                               */
export const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'                    /*
                                                                                *
    frame opcodes - 4 bits on the wire saying what a frame IS.                  *
    0x0-0x7 are data frames, 0x8-0xf are control frames:                        *
    control frames are never fragmented and may arrive                          *
    in the middle of a fragmented message                                       */
export const OP = {
    cont : 0x0, // continuation of a fragmented message - we never fragment
    text : 0x1, // utf8 payload    - everything the gateway pushes
    bin  : 0x2, // binary payload  - unused here
    close: 0x8, // close handshake - 2 byte status code + optional reason
    ping : 0x9, // keepalive probe - receiver must answer with a pong
    pong : 0xA, // the answer, payload echoed back
}                                                                              /*
    rfc 6455 §4.2.2 - the client kills the connection unless                    *
    the 101 carries exactly this value for its sec-websocket-key                */
export function acceptKey(key) {
    return createHash('sha1')
        .update(key + MAGIC)
        .digest('base64')
}

// ── frame codec ──────────────────────────────────────────────

/*
    the rfc 6455 §5.2 frame layout:

     0               1               2               3
     0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
    +-+-+-+-+-------+-+-------------+-------------------------------+
    |F|R|R|R| op    |M| len (7)     | extended length (16 or 64)    |
    |I|S|S|S| code  |A|             | present only when len is      |
    |N|V|V|V| (4)   |S|             | 126 (u16) or 127 (u64)        |
    +-+-+-+-+-------+-+-------------+-------------------------------+
    | masking key (4 bytes, present only when MASK)                 |
    +---------------------------------------------------------------+
    | payload - XORed with the key when MASK                        |
    +---------------------------------------------------------------+

    FIN marks the last fragment of a message - we always send whole
    messages, so it is always set. RSV bits belong to extensions we
    don't speak (deflate etc) - always 0.

    length is a 7-bit field with two escape values:
        n < 126     - the field is the length
        n < 65536   - field = 126, real length in the next 2 bytes
        else        - field = 127, real length in the next 8 bytes

    masking: client → server frames MUST be masked (4 random bytes,
    payload XORed with them), server → client MUST NOT be. it is not
    encryption - the key travels in the same frame. it randomizes the
    bytes on the wire so a malicious script can't shape a payload that
    LOOKS like an http request and poison a dumb caching proxy sitting
    between browser and server (the §10.3 cache-poisoning attack).
*/

/**
 * @param  { Buffer | string } payload
 * @param  {{ opcode?: number, mask?: boolean }} [opt] - mask: true = act as a client
 * @return { Buffer } one complete wire frame, FIN always set
 */
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
 *      stateful: accumulates partial tcp chunks, emits complete frames.
 *
 *      tcp is a byte stream, not a message stream - one 'data' event
 *      may carry half a frame, or three frames and the start of a
 *      fourth. the parser buffers what arrived, slices off complete
 *      frames in a loop, and keeps the remainder for the next chunk.
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
/**
 * @description
 *     one frame off the front of the buffer, or undefined
 *     when the buffer doesn't hold a complete frame yet
 *
 * @param  { Buffer } buf
 * @return { Frame | undefined }
 */
function readFrame(buf) {
    if (buf.length < 2)
        return

    const opcode =    buf[ 0 ] & 0x0f  // 15
    const fin    = !!(buf[ 0 ] & 0x80) // 128
    const masked = !!(buf[ 1 ] & 0x80) // 128
    let n        =    buf[ 1 ] & 0x7f  // 127
    let off      = 2

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
 *      push-only feed: jwt in ?token=... checked before the 101
 *      (browsers cannot set headers on WebSocket),
 *      sockets keyed by pid,
 *      events with payload.pid go to that player,
 *      price changes broadcast.
 *
 *      lifecycle per socket:
 *          1. http upgrade arrives - verify jwt from ?token=, bad → plain 401
 *          2. answer 101 + Sec-WebSocket-Accept (acceptKey)
 *          3. register the socket under the token's pid
 *          4. inbound frames: ping is echoed as pong, pong marks alive,
 *             close closes politely, anything else is a violation
 *          5. every `ping` interval probe each socket - an unanswered
 *             probe means the tcp connection is dead without having
 *             said so (pulled cable, sleeping laptop, dead nat entry) -
 *             tcp alone would keep it "open" for hours
 *
 *      close codes used: 1000 normal, 1001 going away (shutdown),
 *      1002 protocol error, 1003 unsupported data
 *
 * @param  {{ jwt: { verify(token: string): { pid: string }}, ping?: string | number }} opt
 */
export function createWss({ jwt, ping = '30s' } = {}) {
    const connections = new Map                       // socket → { pid, alive, closed }
    const tid   = setInterval(heartbeat, formatTime(ping))
    tid.unref?.()

    // before the 101 we are still http - a refusal
    // is a plain status line, not a close frame
    function reject(soc, status) {
        soc.write(`HTTP/1.1 ${ status }\r\n\r\n`)
        soc.destroy()
    }

    /*  node hands upgrade requests to `server.on('upgrade')` instead of
        the normal request listener: rq is the parsed http request,
        soc the raw tcp socket - whatever we write next is the protocol */
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

    /*  the polite goodbye: a close frame whose payload is the 2-byte
        status code, sent at most once (`closed` guard), then the socket
        goes down. a proper client answers with its own close frame -
        we don't wait for it, the game feed has nothing left to say */
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

    /*  mark-and-sweep keepalive: flip every socket to not-alive and
        ping it; the pong handler flips it back. still not-alive on the
        next tick = no pong for a full interval = presumed dead, drop */
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

        // one event in, one text frame out - to the owner's sockets when
        // the payload carries a pid, to everyone for price changes
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
