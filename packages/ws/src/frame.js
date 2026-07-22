import { createHash, randomBytes } from 'node:crypto'                          /*

    rfc 6455 in ~250 lines.

    a websocket starts life as a plain http GET:

        GET /?token=... HTTP/1.1
        Connection: Upgrade
        Upgrade: websocket
        Sec-WebSocket-Key: <16 random bytes, base64>

    the server answers `101 Switching Protocols` (handleUpgrade in
    server.js) and from that moment the tcp socket stops being http:
    both sides exchange binary FRAMES (encodeFrame / readFrame),
    full duplex, until a close frame or the socket dies.

    two layers here:
        frame codec - encodeFrame + createFrameParser (pure, no sockets)
        the server  - createWss: socket registry, keepalive, routing (server.js)

    *//*

    the fixed guid from rfc 6455 - every websocket server uses this
    exact string. the handshake echoes base64(sha1(client key + MAGIC))
    back as sec-websocket-accept: not auth, a liveness proof - nothing
    that doesn't specifically speak websocket would know to do this,
    so a naive http server / cache / proxy can't accidentally accept
    an upgrade by echoing headers                                               */
export const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'                    /*

    frame opcodes - 4 bits on the wire saying what a frame IS.
    0x0-0x7 are data frames, 0x8-0xf are control frames:
    control frames are never fragmented and may arrive
    in the middle of a fragmented message */
export const OP = {
    cont : 0x0, // continuation of a fragmented message - never fragmented here
    text : 0x1, // utf8 payload    - everything sent through send()
    bin  : 0x2, // binary payload  - unused here
    close: 0x8, // close handshake - 2 byte status code + optional reason
    ping : 0x9, // keepalive probe - receiver must answer with a pong
    pong : 0xA, // the answer, payload echoed back
}                                                                              /*
    rfc 6455 §4.2.2 - the client kills the connection unless
    the 101 carries exactly this value for its sec-websocket-key */
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
