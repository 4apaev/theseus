import Sync from 'garage/sync'
import { Fail } from 'garage/util'

import { $ } from './dom.js'
import { state, KEY, resetPlayer } from './state.js'

export class Api extends Sync {

    static base = location.origin
    static head = new Headers({
        'content-type': 'application/json',
        ...(state.token && { authorization: 'Bearer ' + state.token }),
    })

    static get(u, x)  { return new Api('get', u, x) }
    static put(u, x)  { return new Api('put', u, x) }
    static post(u, x) { return new Api('post', u, x) }
    static del(u, x)  { return new Api('delete', u, x) }

    static logout(msg) {
        state.alive = false
        state.ws?.close()
        state.token = null

        Api.head.delete('authorization')
        localStorage.removeItem(KEY)
        resetPlayer()

        showAuth(msg)
    }

    head = new Headers(Api.head)

    // Sync's own parse is an instance field, not a prototype method - super.parse
    // does not resolve. this repeats the json/text split, and adds the 2 things
    // Api needs on top: reject on a bad status, and log out on a 401 one.
    parse = async rs => {
        const pay = {
            rs,
            ok    : rs.ok,
            code  : rs.status,
            status: rs.status,
            head  : new Headers(rs.headers),
        }

        try {
            pay.body = pay.head.get('content-type')?.includes?.('application/json')
                ? await rs.json()
                : await rs.text()
        }
        catch (e) {
            pay.error = new Fail(pay.code = 400, e.message, e)
        }

        this.payload = pay
        if (pay.ok && !pay.error) return pay

        rs.status === 401 && Api.logout('session expired')
        throw new Fail(pay.code, pay.body?.error, pay.error)
    }
}

export function showAuth(msg) {
    $.id('who').textContent  = ''
    $.id('auth').hidden = false
    $.id('game').hidden = true
    $.id('logoutBtn').hidden = true
    $.id('authMsg').textContent = msg || ''
}

export const logout = Api.logout

/*  ship, cargo and rig in one read. a rig change touches all 3, and
    the events carry enough to patch, but a reload keeps the client out
    of the business of replaying a distributed saga. */
export async function refreshRig() {
    const [ ship ] = (await Api.get('/api/ship')).body
    state.ship   = ship
    state.cargo  = ship ? (await Api.get(`/api/ship/${ ship.sid }/cargo`)).body : []
    state.fitted = ship ? (await Api.get(`/api/ship/${ ship.sid }/modules`)).body : []
}

export async function refreshMarket() {
    if (!state.ship || state.ship.status !== 'docked')
        return state.market = []

    // the ship may already be gone by the time this resolves - a
    // manifest waypoint departs again right after it arrives. a stale
    // reply must not overwrite whatever docked/departed there next.
    const stid = state.ship.stid
    const { body: rows } = await Api.get(`/api/station/${ stid }/market`)
    if (state.ship.stid === stid && state.ship.status === 'docked')
        state.market = rows
}
