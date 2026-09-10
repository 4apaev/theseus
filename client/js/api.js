import Sync from 'garage/sync'
import { Fail } from 'garage/util'

import { $ } from './dom.js'
import { state, KEY, resetPlayer } from './state.js'

/*  the method follows the body: no body reads, a body writes. a route
    that needs another verb - del for a removal - names it. */
export async function api(path, body, method = body == null ? 'get' : 'post') {
    const rq = Sync[ method ](path, body)

    // state.token
    //     && rq.set('authorization', 'Bearer ' + state.token)

    try {
        return (await rq).body
    }
    catch (rs) {
        rs.status === 401 && logout('session expired')
        Fail.raise(rs.status ?? rs.code, rs.body?.error ?? rs.message)
    }
}

export function showAuth(msg) {
    $.id('who').textContent  = ''
    $.id('auth').hidden = false
    $.id('game').hidden = true
    $.id('logoutBtn').hidden = true
    $.id('authMsg').textContent = msg || ''
}

export function logout(msg) {
    state.alive = false
    state.ws?.close()
    state.token = null

    Sync.head.delete('authorization')
    localStorage.removeItem(KEY)
    resetPlayer()

    showAuth(msg)
}

/*  ship, cargo and rig in one read. a rig change touches all 3, and
    the events carry enough to patch, but a reload keeps the client out
    of the business of replaying a distributed saga. */
export async function refreshRig() {
    const [ ship ] = await api('/ships')
    state.ship   = ship
    state.cargo  = ship ? await api(`/cargo/${ ship.sid }`) : []
    state.fitted = ship ? await api(`/ships/${ ship.sid }/modules`) : []
}

export async function refreshMarket() {
    if (!state.ship || state.ship.status !== 'docked')
        return state.market = []

    // the ship may already be gone by the time this resolves - a
    // manifest waypoint departs again right after it arrives. a stale
    // reply must not overwrite whatever docked/departed there next.
    const stid = state.ship.stid
    const rows = await api(`/market/${ stid }`)
    if (state.ship.stid === stid && state.ship.status === 'docked')
        state.market = rows
}
