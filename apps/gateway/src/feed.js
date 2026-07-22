import { Codec                  } from '@theseus/util'
import { eventTree as EVT       } from '@theseus/contracts'
import { createWss, encodeFrame } from '@theseus/ws'

/*  the game-specific half of the websocket feed: @theseus/ws does the
    protocol (handshake, frames, keepalive), this decides who gets what -
    jwt-verified pid is the connection's identity, events routed to
    their owner, market.price.changed broadcast to everyone */

export function createFeed({ jwt, ping } = {}) {
    const wss = createWss({
        ping,
        authenticate(rq) {
            const token = new URL(rq.url, 'http://gateway').searchParams.get('token')
            return jwt.verify(token)   // throws Fail(401) on bad/expired token
        },
    })

    return {
        handleUpgrade: wss.handleUpgrade,
        stats: wss.stats,
        close: wss.close,

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
            wss.each((claims, socket) => {
                if (pid
                    ? claims.pid === pid
                    : e.event_type === EVT.market.price.changed)
                    wss.send(socket, frame)
            })
        },
    }
}
