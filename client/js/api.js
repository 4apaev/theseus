import Sync from 'garage/sync'
import { Fail } from 'garage/util'

import { $ } from './dom.js'
import { state, KEY, resetPlayer } from './state.js'

export async function api(path, body) {
    const rq = body == null
        ? Sync.get(path)
        : Sync.post(path, body)

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
