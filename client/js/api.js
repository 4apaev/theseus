import Sync from 'garage/sync'
import { Fail } from 'garage/util'

import { $ } from './dom.js'
import { state, KEY, NAMED, resetPlayer } from './state.js'

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
    $('#who').textContent  = ''
    $('#auth').hidden = false
    $('#game').hidden = true
    $('#logoutBtn').hidden = true
    $('#authMsg').textContent = msg || ''
}

export function logout(msg) {
    state.alive = false
    state.ws?.close()
    state.token = null

    Sync.head.delete('authorization')
    localStorage.removeItem(KEY)
    sessionStorage.removeItem(NAMED)   // the next player gets their own prompt
    resetPlayer()

    showAuth(msg)
}

export async function refreshMarket() {
    state.market = state.ship
    && state.ship.status === 'docked'
        ? await api(`/market/${ state.ship.stid }`)
        : []
}
