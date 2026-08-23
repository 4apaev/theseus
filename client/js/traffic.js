import { api } from './api.js'
import { state } from './state.js'

/*  other players' ships.
    the gateway removes the pid from another player's event.
    so an event that still has a pid is our own ship.
    do not compare sid - state.ship is undefined until the first ship
    exists, and our own ship.created would then look like a stranger. */

export function mine(p) {
    return p.pid === state.me?.pid
}

export function who(sid) {
    return state.traffic.get(sid)?.handle ?? 'a pilot'
}

export async function refreshTraffic() {
    const rows = await api('/traffic')
    state.traffic = new Map(rows
        .filter(t => t.sid !== state.ship?.sid)
        .map(t => [ t.sid, t ]))
}

// change one tracked ship. an unknown sid means the ship appeared while
// the socket was down. the next hydrate collects it.
export function track(sid, patch) {
    const row = state.traffic.get(sid)
    row && Object.assign(row, patch)
}

// the map draws every ship in transit. it always draws our own ship.
export function drawnShips() {
    const moving = [ ...state.traffic.values() ].filter(s => s.status === 'transit')
    return state.ship ? [ state.ship, ...moving ] : moving
}

// who else is docked at a station
export function dockedAt(stid) {
    return stid
        ? [ ...state.traffic.values() ].filter(t => t.status === 'docked' && t.stid === stid)
        : []
}
