import { O, Codec               } from '@theseus/util'
import { eventTree as EVT       } from '@theseus/contracts'
import { createWss, encodeFrame } from '@theseus/ws'

/*  the game-specific half of the websocket feed: @theseus/ws does the
    protocol (handshake, frames, keepalive), decides who gets what.

    the jwt pid is the identity of the connection.
    an event goes to its owner in full.
    a ship movement also goes to every other socket, without the pid.
    an admin socket gets every event in full. */

/*  the public shape of an event.
    this is an allowlist  */

function publicPrice(p) {
    return p                    // a price carries no pid
}

function publicShipCreated({ sid, stid, name }) {
    return { sid, stid, name }
}

function publicShipDeparted(p) {
    return {
        sid      : p.sid,
        from     : p.from,
        to       : p.to,
        arrives  : p.arrives,
        years_abs: p.years_abs, // the client needs it to move the marker
    }
}

function publicShipRenamed({ sid, name }) {
    return { sid, name }
}

function publicShipArrived(p) {
    return { sid: p.sid, stid: p.stid, arrived: p.arrived }
}

// ship.travel.rejected is absent on purpose. a failure stays private.
const PUBLIC = O.ƒ({
    [ EVT.market.price.changed ]: publicPrice,
    [ EVT.ship.created         ]: publicShipCreated,
    [ EVT.ship.departed        ]: publicShipDeparted,
    [ EVT.ship.arrived         ]: publicShipArrived,
    [ EVT.ship.renamed         ]: publicShipRenamed,
})

/*  who gets the whole payload: the player who owns the event,
    and any admin.
    every other socket gets the public shape, or nothing.

    keep the `pid &&` test. an event with no pid, and a socket with no
    pid, would compare undefined to undefined. that leaks the payload.
    player.login.rejected.v1 has no pid in its payload. */
export function seesAll(claims, pid) {
    return claims.role === 'admin'
        || !!(pid && claims.pid === pid)
}

function ownFrame(e) {
    return encodeFrame(Codec.encode({
        correlation_id: e.correlation_id,
        event_type    : e.event_type,
        occurred      : e.occurred,
        payload       : e.payload,
    }))
}

/*  the open frame drops correlation_id too. it means nothing to a
    stranger, and its absence stops a foreign event from marking one of
    your pending commands as done. */
function openFrame(e, payload) {
    return encodeFrame(Codec.encode({
        event_type: e.event_type,
        occurred  : e.occurred,
        payload,
    }))
}

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
        close: wss.close,       /*
        one event in, one frame per socket.
        each frame is built one time,
        and only if a socket needs it.
    */  push(e) {
            const pid = e?.payload?.pid
            const pub = PUBLIC[ e.event_type ]
            let own, open

            wss.each((claims, socket) => {
                if (seesAll(claims, pid))
                    wss.send(socket, own ??= ownFrame(e))

                else if (pub)
                    wss.send(socket, open ??= openFrame(e, pub(e.payload)))
            })
        },
    }
}
