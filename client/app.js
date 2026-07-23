/* eslint-disable camelcase */
import Sync from 'garage/sync'
import { A, O, Is, each, Fail } from 'garage/util'

// ── 1. state + constants ────────────────────────────────────────────────────

Sync.base = location.origin
Sync.head = new Headers({ 'content-type': 'application/json' })

const KEY = 'theseus.token'

const state = {
    token   : localStorage.getItem(KEY),
    me      : null,
    universe: null,
    ship    : null,
    cargo   : [],
    market  : [],
    trades  : [],
    pending : new Map,   // correlation_id → { label, el }
    ws      : null,
    wsTries : 0,
    alive   : false,
}

// ── 2. dom + format helpers ──────────────────────────────────────────────────

function $() {
    let query, fx, node = document

    if (arguments[ 0 ]?.raw) {
        query = String.raw(...arguments)
    }
    else {
        for (let a of arguments) {
            switch (typeof a) {
                case 'function': fx = a; break
                case 'object'  : node = a; break
                case 'string'  : query ? fx ??= x => x[ a ] : query = a; break
                default        :         fx ??= x => x[ a ]; break
            }
        }
    }
    query = query.replace(/^ *\++ */, _ => (fx ??= x => x, ''))
    return fx
        ? A.from(node.querySelectorAll(query), fx)
        : node.querySelector(query)
}

$.of = (tag, x, ...a) => {
    const node = document.createElement(tag)
    /**/ if (Is(Node, x)) node.append(x)
    else if (Is.o(x)) each(x, node.setAttribute, node)
    else if (Is(x)) node.textContent = String(x)
    a.length && node.append(...a)
    return node
}

const sleep = ms => new Promise(ok => setTimeout(ok, ms))

function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#39;',
    }[ c ]))
}

const cr = n => '₢' + Number(n).toFixed(2)
const fmtYears = n => Number(n).toFixed(1)

function station(stid) {
    return state.universe?.stations.find(s => s.stid === stid)?.name
        ?? stid
        ?? '—'
}

function good(gid) {
    return state.universe?.goods[ gid ]?.name ?? gid
}

// ── 3. api ────────────────────────────────────────────────────────────────

async function api(path, body) {
    const rq = body === undefined ? Sync.get(path) : Sync.post(path, body)
    state.token && rq.set('authorization', 'Bearer ' + state.token)

    try {
        return (await rq).body
    }
    catch (rs) {
        rs.status === 401 && logout('session expired')
        Fail.raise(rs.status ?? rs.code, rs.body?.error ?? rs.message)
    }
}

// ── 4. feed ───────────────────────────────────────────────────────────────

function feedLine(kind, text) {

    const t = (new Date).toTimeString().slice(0, 8)
    const el = $.of('div', {
        class: 'ln ' + kind,
    }, `[${ t }] ${ text }`)

    const feed     = $('#feed')
    const atBottom = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 4

    feed.appendChild(el)
    while (feed.children.length > 200)
        feed.removeChild(feed.firstChild)

    if (atBottom)
        feed.scrollTop = feed.scrollHeight

    return el
}

function mark(el, ok) {
    el.textContent = el.textContent.replace('…', ok ? '✓' : '✗')
    el.classList.remove('cmd')
    el.classList.add(ok ? 'ok' : 'err')
}

// ── 5. render ─────────────────────────────────────────────────────────────

function renderAll() {
    renderWallet()
    renderShip()
    renderTravel()
    renderMarket()
    renderCargo()
    renderTrades()
}

function renderWallet() {
    const body = $('#walletBody')
    body.replaceChildren()

    if (!state.me)
        return body.append($.of('p', { class: 'dim' }, '—'))

    body.append(
        $.of('p', { class: 'money' }, cr(state.me.balance)),
        $.of('p', { class: 'dim' }, `${ state.me.handle } · ${ state.me.pid }`))
}

function renderShip() {
    const body = $('#shipBody')
    const s    = state.ship

    if (!s)
        return body.innerHTML = '<p class="dim">awaiting ship commission…</p>'

    if (s.status === 'docked') {
        return body.innerHTML = `
            <p>"${ esc(s.name) }" · docked at ${ esc(station(s.stid)) }</p>
            <p class="dim">cap ${ s.capacity } · v ${ s.velocity }c ·
               hold ${ state.cargo.reduce((n, c) => n + c.quantity, 0) }/${ s.capacity }</p>`
    }

    body.innerHTML = `
        <p>${ esc(station(s.from)) } → ${ esc(station(s.to)) }</p>
        <p class="money" id="eta">T-…</p>
        <p class="dim">you'll age ${ fmtYears(s.years_rel) }yr ·
           the galaxy ages ${ fmtYears(s.years_abs) }yr</p>`
    tickEta()
}

function tickEta() {
    const s  = state.ship
    const el = $('#eta')
    if (!s || s.status !== 'transit' || !el) return

    const ms = Date.parse(s.arrives) - Date.now()
    if (ms <= 0)
        return el.textContent = 'T- arriving…'

    const total = Math.floor(ms / 1000)
    const mm = String(Math.floor(total / 60)).padStart(2, '0')
    const ss = String(total % 60).padStart(2, '0')
    el.textContent = `T-${ mm }:${ ss }`
}

function renderTravel() {
    const body = $('#travelBody')
    const s    = state.ship

    if (!s || !state.universe) { body.innerHTML = '<p class="dim">—</p>'; return }
    if (s.status !== 'docked') { body.innerHTML = '<p class="dim">in transit</p>'; return }

    const routes = state.universe.routes.filter(r => r.from === s.stid)
    if (!routes.length) { body.innerHTML = '<p class="dim">no routes from here</p>'; return }

    const v = s.velocity
    const { time_scale, interest_rate } = state.universe.constants
    const principal = Number(state.me?.balance ?? 0)

    body.innerHTML = routes.map(r => {
        const abs  = r.ly / v
        const rel  = abs * Math.sqrt(1 - v * v)
        const secs = Math.round(abs * time_scale)
        const cost = principal * (Math.pow(1 + interest_rate, abs) - 1)

        return `
            <button type="button" class="travelBtn" data-to="${ esc(r.to) }">
                ${ esc(station(r.to)) } · ${ r.ly }ly · eta ${ fmtYears(abs) }yr (~${ secs }s) ·
                you'd age ${ fmtYears(rel) }yr · ${ cr(cost) } time-cost on your balance
            </button>
        `
    }).join('')
}

function renderMarket() {
    const body = $('#marketBody')
    const form = $('#tradeForm')

    if (!state.ship || state.ship.status !== 'docked') {
        body.innerHTML = '<p class="dim">— in transit · market offline —</p>'
        form.hidden = true
        return
    }

    form.hidden = false
    body.innerHTML = state.market.length
        ? `<table><tr><th>GOOD</th><th>BUY</th><th>SELL</th></tr>${
            state.market.map(m => `
                <tr><td>${ esc(good(m.gid)) }</td><td>${ cr(m.price_buy) }</td><td>${ cr(m.price_sell) }</td></tr>
            `).join('')
        }</table>`
        : '<p class="dim">— no goods quoted —</p>'

    const sel  = $('#tradeGood')
    const prev = sel.value
    sel.innerHTML = state.market.map(m => `<option value="${ esc(m.gid) }">${ esc(good(m.gid)) }</option>`).join('')
    if (state.market.some(m => m.gid === prev)) sel.value = prev

    updateHint()
}

function updateHint() {
    const row = state.market.find(m => m.gid === $('#tradeGood').value)
    $('#tradeHint').textContent = row
        ? `buy ≤ ${ cr(row.price_buy * 1.1) } · sell ≥ ${ cr(row.price_sell * 0.9) }`
        : ''
}

function renderCargo() {
    const body = $('#cargoBody')
    body.innerHTML = state.cargo.length
        ? `<table><tr><th>GOOD</th><th>QTY</th></tr>${
            state.cargo.map(c => `<tr><td>${ esc(good(c.gid)) }</td><td>${ c.quantity }</td></tr>`).join('')
        }</table>`
        : '<p class="dim">hold empty</p>'
}

function renderTrades() {
    const body = $('#tradesBody')
    body.innerHTML = state.trades.length
        ? `<table><tr><th>SIDE</th><th>QTY</th><th>GOOD</th><th>UNIT</th></tr>${
            state.trades.slice(0, 20).map(t => `
                <tr><td>${ esc(t.side) }</td><td>${ t.quantity }</td><td>${ esc(good(t.gid)) }</td><td>${ cr(t.price_unit) }</td></tr>
            `).join('')
        }</table>`
        : '<p class="dim">no trades yet</p>'
}

function setConn(text) {
    const con = $('#conn')
    con.textContent = text
    con.className   = text === 'ONLINE' ? 'ok' : 'dim'
}

// ── 6. auth ───────────────────────────────────────────────────────────────

function showAuth() {
    $('#who').textContent  = ''
    $('#auth').hidden = false
    $('#game').hidden = true
    $('#logoutBtn').hidden = true
}

function logout(msg) {
    state.alive = false
    state.ws?.close()
    state.token = null
    localStorage.removeItem(KEY)
    showAuth()
    $('#authMsg').textContent = msg || ''
}

async function register() {
    const handle   = $('#handle').value.trim()
    const password = $('#password').value
    $('#authMsg').textContent = ''

    if (!handle || !password)
        return $('#authMsg').textContent = 'handle and password required'

    try {
        const rs = await Sync.post('/register', { handle, password })
        if (rs.status === 202) {
            $('#authMsg').textContent = 'registration queued - retrying login…'
            await sleep(1500)
            return login()
        }
        feedLine('ok', `registered ${ handle }`)
        return login()
    }
    catch (rs) {
        $('#authMsg').textContent = rs.body?.error
            || (rs.status === 409 ? 'handle taken' : 'registration failed')
    }
}

async function login() {
    const [ handle, password ] = $('.auth input', x => x.value.trim())
    // const handle   = $('#handle').value.trim()
    // const password = $('#password').value

    try {
        const { body } = await Sync.post('/login', { handle, password })

        localStorage.setItem(KEY, state.token = body.token)
        $('#authMsg').textContent = ''
        return enterGame()
    }
    catch (rs) {
        $('#authMsg').textContent = rs.body?.error || 'login failed - try again in a moment'
    }
}

// ── 7. hydrate ────────────────────────────────────────────────────────────

async function enterGame() {
    state.alive = true
    $('#auth').hidden = true
    $('#game').hidden = false
    $('#logoutBtn').hidden = false

    await hydrate()
    connect()
}

async function refreshMarket() {
    state.market = state.ship && state.ship.status === 'docked'
        ? await api(`/market/${ state.ship.stid }`)
        : []
}

async function hydrate() {
    for (let i = 0; state.alive && i < 20 && !state.me; i++) {
        try { state.me = await api('/me') }
        catch (e) {
            if (!state.alive) return          // api() already logged out on 401
            feedLine('dim', 'syncing…')
            await sleep(500)
        }
    }
    if (!state.alive) return

    $('#who').textContent = state.me?.handle ?? ''
    state.universe ??= await api('/universe')

    const ships = await api('/ships')
    state.ship  = ships[ 0 ] ?? null

    state.cargo = state.ship ? await api(`/cargo/${ state.ship.sid }`) : []
    await refreshMarket()
    state.trades = await api('/trades')

    renderAll()
}

// ── 8. websocket ──────────────────────────────────────────────────────────

function connect() {
    if (!state.alive) return

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws    = state.ws = new WebSocket(`${ proto }://${ location.host }/?token=${ state.token }`)

    ws.onopen    = () => { state.wsTries = 0; setConn('ONLINE') }
    ws.onmessage = m  => dispatch(JSON.parse(m.data))

    ws.onclose = () => {
        setConn('OFFLINE')
        if (!state.alive) return

        const wait = Math.min(1000 * 2 ** state.wsTries++, 10000)
        setTimeout(async () => {
            if (!state.alive) return
            try { await hydrate() }
            catch (e) { feedLine('err', 're-sync failed: ' + e.message) }
            if (!state.alive) return   // hydrate's 401 path may have logged out
            connect()
        }, wait)
    }
}

function flavor(e) {
    const p = e.payload
    switch (e.event_type) {
        case 'ship.created.v1'            : return { kind: 'ok' , text: `ship "${ p.name }" commissioned at ${ station(p.stid) }` }
        case 'ship.departed.v1'           : return { kind: 'ok' , text: `departed ${ station(p.from) } → ${ station(p.to) } · you age ${ fmtYears(p.years_rel) }yr, the galaxy ages ${ fmtYears(p.years_abs) }yr` }
        case 'ship.arrived.v1'            : return { kind: 'ok' , text: `docked at ${ station(p.stid) }` }
        case 'ship.travel.rejected.v1'    : return { kind: 'err', text: `travel rejected: ${ p.reason }` }
        case 'cargo.loaded.v1'            : return { kind: 'ok' , text: `+${ p.quantity } ${ good(p.gid) } loaded` }
        case 'cargo.unloaded.v1'          : return { kind: 'ok' , text: `-${ p.quantity } ${ good(p.gid) } unloaded` }
        case 'cargo.operation.rejected.v1': return { kind: 'err', text: p.reason }
        case 'market.trade.executed.v1'   : return { kind: 'ok' , text: `${ p.side } ${ p.quantity } × ${ good(p.gid) } @ ${ cr(p.price_unit) } = ${ cr(p.price_total) }` }
        case 'market.trade.rejected.v1'   : return { kind: 'err', text: `${ p.side } rejected: ${ p.reason }` }
        case 'wallet.debited.v1'          : return { kind: 'ok' , text: `-${ cr(p.amount) } → ${ cr(p.balance) }` }
        case 'wallet.credited.v1'         : return { kind: 'ok' , text: `+${ cr(p.amount) } → ${ cr(p.balance) }` }
        case 'wallet.transaction.rejected.v1': return { kind: 'err', text: p.reason }
        case 'market.price.changed.v1'    : return { kind: 'dim', text: `${ station(p.stid) } quotes ${ good(p.gid) } buy ${ cr(p.price_buy) } sell ${ cr(p.price_sell) }` }
        default                           : return { kind: 'dim', text: e.event_type }
    }
}

function mutateCargo(gid, delta) {
    const i = state.cargo.findIndex(c => c.gid === gid)
    if (i === -1) { delta > 0 && state.cargo.push({ gid, quantity: delta }); return }
    state.cargo[ i ].quantity += delta
    state.cargo[ i ].quantity <= 0 && state.cargo.splice(i, 1)
}

const mutate = {
    async 'ship.created.v1'() {
        const rows = await api('/ships')
        state.ship = rows[ 0 ]
        await refreshMarket()
    },
    'ship.departed.v1'(p) {
        Object.assign(state.ship, {
            status: 'transit', from: p.from, to: p.to,
            arrives: p.arrives, years_abs: p.years_abs, years_rel: p.years_rel,
            stid: null,
        })
        state.market = []
    },
    async 'ship.arrived.v1'(p) {
        Object.assign(state.ship, { status: 'docked', stid: p.stid, from: void 0, to: void 0, arrives: void 0 })
        await refreshMarket()
    },
    'cargo.loaded.v1'  : p => mutateCargo(p.gid,  p.quantity),
    'cargo.unloaded.v1': p => mutateCargo(p.gid, -p.quantity),
    'market.trade.executed.v1': p => state.trades.unshift({ ...p, created: (new Date).toISOString() }),
    'wallet.debited.v1'(p) { if (state.me) state.me.balance = Number(p.balance) },
    'wallet.credited.v1'(p) { if (state.me) state.me.balance = Number(p.balance) },
    'market.price.changed.v1'(p) {
        if (!state.ship || p.stid !== state.ship.stid) return
        const i   = state.market.findIndex(m => m.gid === p.gid)
        const row = { gid: p.gid, price_buy: p.price_buy, price_sell: p.price_sell }
        i === -1 ? state.market.push(row) : state.market[ i ] = row
    },
}

async function dispatch(e) {
    const { kind, text } = flavor(e)
    const line = feedLine(kind, text)

    if (e.correlation_id && state.pending.has(e.correlation_id)) {
        const p = state.pending.get(e.correlation_id)
        line.textContent += ` [${ p.label }]`
        mark(p.el, kind !== 'err')
        state.pending.delete(e.correlation_id)
    }

    await mutate[ e.event_type ]?.(e.payload)
    renderAll()
}

// ── 9. commands ───────────────────────────────────────────────────────────

async function send(path, body, label) {
    const el = feedLine('cmd', `→ ${ label } …`)
    try {
        const { correlation_id } = await api(path, body)
        state.pending.set(correlation_id, { label, el })
    }
    catch (e) {
        mark(el, false)
        el.textContent += ` ${ e.message }`
    }
}

function travel(to) {
    const s = state.ship
    if (!s || s.status !== 'docked') return
    send('/travel', { sid: s.sid, from: s.stid, to }, `travel → ${ station(to) }`)
}

function buy() {
    const s = state.ship
    if (!s || s.status !== 'docked') return
    const gid = $('#tradeGood').value
    const row = state.market.find(m => m.gid === gid)
    if (!row) return
    const quantity = Math.max(1, Number($('#tradeQty').value) || 1)
    const price_unit_max = +(Number(row.price_buy) * 1.1).toFixed(4)
    send('/buy', { gid, sid: s.sid, stid: s.stid, quantity, price_unit_max }, `buy ${ quantity } ${ good(gid) }`)
}

function sell() {
    const s = state.ship
    if (!s || s.status !== 'docked') return
    const gid = $('#tradeGood').value
    const row = state.market.find(m => m.gid === gid)
    if (!row) return
    const quantity = Math.max(1, Number($('#tradeQty').value) || 1)
    const price_unit_min = +(Number(row.price_sell) * 0.9).toFixed(4)
    send('/sell', { gid, sid: s.sid, stid: s.stid, quantity, price_unit_min }, `sell ${ quantity } ${ good(gid) }`)
}

// ── 10. wiring + boot ─────────────────────────────────────────────────────

$('#registerBtn').addEventListener('click', register)
$('#loginBtn').addEventListener('click', login)
$('#logoutBtn').addEventListener('click', () => logout())
$('#buyBtn').addEventListener('click', buy)
$('#sellBtn').addEventListener('click', sell)
$('#tradeGood').addEventListener('change', updateHint)
$('#password').addEventListener('keydown', e => e.key === 'Enter' && login())

$('#travelBody').addEventListener('click', e => {
    const btn = e.target.closest('.travelBtn')
    btn && travel(btn.dataset.to)
})

setInterval(tickEta, 250)

feedLine('dim', 'terminal ready')
state.token ? enterGame() : showAuth()
