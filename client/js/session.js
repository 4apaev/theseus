import Sync from 'garage/sync'

import { $ } from './dom.js'
import { state, KEY } from './state.js'
import { feedLine } from './feed.js'
import { api, refreshMarket } from './api.js'
import { refreshTraffic } from './traffic.js'
import { renderAll, setConn } from './render.js'
import { dispatch } from './events.js'

export const sleep = ms => new Promise(ok => setTimeout(ok, ms))

export async function register() {
    const handle   = $('#handle').value.trim()
    const password = $('#password').value
    const authMsg = $('#authMsg')
    authMsg.textContent = ''

    if (!handle || !password)
        return authMsg.textContent = 'handle and password required'

    try {
        const rs = await Sync.post('/register', { handle, password })
        if (rs.status === 202) {
            authMsg.textContent = 'registration queued - retrying login…'
            await sleep(1500)
            return login()
        }
        feedLine('ok', `registered ${ handle }`)
        return login()
    }
    catch (rs) {
        authMsg.textContent = rs.body?.error || (rs.status === 409
            ? 'handle taken'
            : 'registration failed')
    }
}

export async function login() {
    const [ handle, password ] = $('.auth input', x => x.value.trim())
    try {
        const { body } = await Sync.post('/login', { handle, password })

        localStorage.setItem(KEY, state.token = body.token)
        Sync.head.set('authorization', 'Bearer ' + state.token)

        $('#authMsg').textContent = ''
        return enterGame()
    }
    catch (rs) {
        $('#authMsg').textContent = rs.body?.error || 'login failed - try again in a moment'
    }
}

export async function enterGame() {
    state.alive = true
    $('#auth').hidden = true
    $('#game').hidden = false
    $('#logoutBtn').hidden = false

    await hydrate()
    connect()
}

export async function hydrate() {
    for (let i = 0; state.alive && i < 20 && !state.me; i++) {
        try {
            state.me = await api('/me')
        }
        catch (e) {
            if (!state.alive) return          // api() already logged out on 401
            feedLine('dim', 'syncing…')
            await sleep(500)
        }
    }
    if (!state.alive) return

    $('#who').textContent = state.me?.handle ?? ''
    state.universe ??= await api('/universe')

    const [ ship ] = await api('/ships')
    state.ship  = ship

    state.cargo = ship ? await api(`/cargo/${ ship.sid }`) : []
    await refreshMarket()
    await refreshTraffic()   // reconnect calls hydrate, so traffic re-syncs too
    state.trades = await api('/trades')

    renderAll()
}

export function connect() {
    if (!state.alive) return

    if (state.ws) {

        state.ws.onclose = void 0   // a stale socket's own reconnect loop would race this one
        state.ws.close()
    }

    const ws = state.ws = new WebSocket(`${
        location.protocol.replace(/http/, 'ws') }//${
        location.host }/?token=${
        state.token }`)

    ws.onopen = () => setConn('ONLINE', state.wsTries = 0)
    ws.onmessage = m  => dispatch(JSON.parse(m.data))
    ws.onclose = () => {
        setConn('OFFLINE')
        if (!state.alive) return

        const wait = Math.min(1000 * 2 ** state.wsTries++, 10000)
        setTimeout(async () => {
            if (!state.alive) return
            try {
                await hydrate()
            }
            catch (e) {
                feedLine('err', 're-sync failed: ' + e.message)
            }

            state.alive && connect() // hydrate's 401 path may have logged out
        }, wait)
    }
}
