import { EVT } from '@theseus/contracts'
import Wss, { encodeFrame } from 'garage/mw/ws'
import {
    O,
    echo,
    Codec,
    formatTime,
}   from '@theseus/util'

/*  the game-specific half of the websocket feed: garage/mw/ws does the
    protocol (handshake, frames, keepalive), decides who gets what.

    the jwt pid is the identity of the connection.
    an event goes to its owner in full.
    a ship movement also goes to every other socket, without the pid.
    an admin socket gets every event in full.
*//*
    the public shape of an event.
    this is an allowlist
*/

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

function publicShipArrived({ sid, stid, arrived }) {
    return { sid, stid, arrived }
}

/*
    ship.travel.rejected is absent on purpose. a failure stays private.
    a message event is absent on purpose too. see pushMessage below.
    neither kind gets a redacted public shape.
*/
const PUBLIC = O.ƒ({
    [ EVT.market.price.changed ]: echo, // a price carries no pid
    [ EVT.ship.created         ]: publicShipCreated,
    [ EVT.ship.departed        ]: publicShipDeparted,
    [ EVT.ship.arrived         ]: publicShipArrived,
    [ EVT.ship.renamed         ]: publicShipRenamed,
})

const MESSAGE = O.ƒ({
    [ EVT.message.sent      ]: true,
    [ EVT.message.delivered ]: true,
})

/*  who gets the whole payload:
    the player who owns the event, and any admin.
    every other socket gets the public shape, or nothing.

    keep the `pid &&` test.
    an event with no pid, and a socket with no pid,
    would compare undefined to undefined.
    that leaks the payload.
    player.login.rejected.v1 has no pid in its payload.
*/
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

/**
 * @param  { { jwt: Auth, ping?: string | number } } opt
 * @return { Feed }
 */
export function createFeed({ jwt, ping } = {}) {

    const wss = Wss({
        ping: formatTime(ping),
        authenticate(rq) {
            const token = new URL(rq.url, 'http://gateway').searchParams.get('token')
            return jwt.verify(token)   // throws Fail(401) on bad/expired token
        },
    })

    // pid -> current stid. events.ship feeds this map.
    const docked = new Map

    return {
        handleUpgrade: wss.handleUpgrade,
        stats: wss.stats,
        close: wss.close,
        /*
            one event in, one frame per socket.
            it builds each frame once, only when a socket needs it.
        */
        push(e) {
            trackDock(docked, e)

            if (MESSAGE[ e.event_type ])
                return pushMessage(wss, docked, e)

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

function trackDock(docked, e) {
    switch (e.event_type) {
        case EVT.ship.created : return docked.set(e.payload.pid, e.payload.stid)
        case EVT.ship.arrived : return docked.set(e.payload.pid, e.payload.stid)
        case EVT.ship.departed: return docked.set(e.payload.pid, void 0)
    }
}

/**
 * @description
 *   a dm's audience is its 2 participants.
 *   station chat's audience is every pid this feed has docked at
 *   that station right now.
 *
 * @param {Map<string, string>} docked
 * @param {MsgEvent} event
 * @return {Set<string>}
 */
function messageAudience(docked, { payload }) {
    if (payload.to) return new Set([ payload.from, payload.to ])

    const here = new Set
    for (const [ player, station ] of docked)
        station === payload.stid && here.add(player)
    return here
}

/**
 * @description
 *   the audience gets the full payload.
 *   everyone else gets nothing.
 *   a message never falls back to a redacted public shape.
 *
 * @param {TWss} wss
 * @param {Map<string, string>} docked
 * @param {MsgEvent} e
 */
function pushMessage(wss, docked, e) {
    const audience = messageAudience(docked, e)
    let own

    wss.each((claims, socket) => {
        if (claims.role === 'admin' || audience.has(claims.pid))
            wss.send(socket, own ??= ownFrame(e))
    })
}

//── EXPORT DEFAULT ────────────────────────────────────────────────────────────────────────

export default createFeed

/**
 * @typedef { import('garage/mw/ws').Wss } TWss
 * @typedef { import('@theseus/auth').Auth } Auth
 * @typedef { import('../types/feed.js').Feed } Feed
 * @typedef { { payload: { to?: string, from: string, stid?: string }}} MsgEvent
 */
