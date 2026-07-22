import { formatTime } from '@theseus/util'

import {
    OP,
    acceptKey,
    encodeFrame,
    createFrameParser,
} from './frame.js'

/**
 * @description
 *      a minimal rfc 6455 server: handshake, socket registry, keepalive.
 *      knows nothing about who a connection belongs to or what it should
 *      receive - `authenticate(rq)` returns whatever per-connection
 *      metadata the caller wants (or nothing, for an open/anonymous
 *      server), and `each()` hands that metadata back so the caller can
 *      decide who gets a message. push-only by design: inbound text
 *      frames are ignored, only ping/pong/close are handled.
 *
 *      lifecycle per socket:
 *          1. http upgrade arrives - `authenticate(rq)` runs; throwing
 *             (or a rejected promise) → plain 401, before the 101
 *          2. answer 101 + Sec-WebSocket-Accept (acceptKey)
 *          3. register the socket with its authenticate() result
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
 * @template  Meta
 * @param  {{ authenticate?: (rq: import('node:http').IncomingMessage) => Meta | Promise<Meta>, ping?: string | number }} [opt]
 */
export function createWss({
    ping = '30s',
    authenticate = () => void 0,
} = {}) {

    const connections = new Map // socket → { meta, alive, closed }
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
    async function handleUpgrade(rq, soc) {
        let meta
        try {
            meta = await authenticate(rq)
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

        const con = { meta, alive: true, closed: false }
        connections.set(soc, con)

        const parser = createFrameParser(frame => {
            if (!frame.masked || !frame.fin)                 // client frames must be masked, whole
                return close(soc, 1002)

            switch (frame.opcode) {
                case OP.ping : return soc.write(encodeFrame(frame.payload, { opcode: OP.pong }))
                case OP.pong : return con.alive = true
                case OP.close: return close(soc, 1000)
                case OP.text : return                        // push-only, inbound text ignored
                default      : return close(soc, 1003)
            }
        })

        soc.on('data', chunk => parser.push(chunk))
        soc.on('error', () => drop(soc))
        soc.on('close', () => connections.delete(soc))
    }

    /*  the polite goodbye: a close frame whose payload is the 2-byte
        status code, sent at most once (`closed` guard), then the socket
        goes down. we don't wait for the peer's own close frame back -
        there's nothing left to say once the caller decided to close */
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

        // guarded raw write of an already-encoded frame - never
        // double-encodes, callers build frames via encodeFrame themselves
        send(soc, frame) {
            connections.get(soc)?.closed || soc.write(frame)
        },

        // iterate live connections with their authenticate() metadata -
        // the caller decides who gets what (broadcast, filter by meta, ...)
        each(fn) {
            for (const [ soc, con ] of connections)
                fn(con.meta, soc)
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
