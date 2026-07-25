import { $, esc, cr, fmtYears } from './dom.js'
import { state, station, good } from './state.js'
import { renderTravel, tickShipMarker } from './map.js'

export function renderAll() {
    renderWallet()
    renderShip()
    renderTravel()
    renderMarket()
    renderCargo()
    renderTrades()
}

export function renderWallet() {
    const body = $('#walletBody')
    body.replaceChildren()

    if (!state.me)
        return body.append($.of('p', { class: 'dim' }, '—'))

    body.append(
        $.of('p', { class: 'money' }, cr(state.me.balance)),
        $.of('p', { class: 'dim' }, `${ state.me.handle } · ${ state.me.pid }`))
}

export function renderShip() {
    const body = $('#shipBody')
    const ship = state.ship

    if (!ship)
        return body.innerHTML = '<p class="dim">awaiting ship commission…</p>'

    if (ship.status === 'docked') {
        return body.innerHTML = `
            <p>"${ esc(ship.name) }" · docked at ${ esc(station(ship.stid)) }</p>
            <p class="dim">cap ${ ship.capacity } · v ${ ship.velocity }c ·
               hold ${ state.cargo.reduce((n, c) => n + c.quantity, 0) }/${ ship.capacity }</p>`
    }

    body.innerHTML = `<p>${
        esc(station(ship.from)) } → ${
        esc(station(ship.to))
    }</p>
    <p class="money" id="eta">T-…</p>
    <p class="dim">you'll age ${ fmtYears(ship.years_rel) }yr
        · the galaxy ages ${ fmtYears(ship.years_abs) }yr</p>`
    tickEta()
}

export function tickEta() {
    const ship = state.ship
    if (ship?.status === 'transit')
        tickCountdown(ship), tickShipMarker(ship)
}

function tickCountdown(ship) {
    const el = $('#eta')
    if (!el) return
    const ms = Date.parse(ship.arrives) - Date.now()
    el.textContent = ms <= 0 ? 'T- arriving…' : fmtCountdown(ms)
}

function fmtCountdown(ms) {
    const total = Math.floor(ms / 1000)
    const mm = String(Math.floor(total / 60)).padStart(2, '0')
    const ss = String(total % 60).padStart(2, '0')
    return `T-${ mm }:${ ss }`
}

export function renderMarket() {
    const body = $('#marketBody')
    const form = $('#tradeForm')

    if (!state.ship || state.ship.status !== 'docked') {
        body.innerHTML = '<p class="dim">— in transit · market offline —</p>'
        return form.hidden = true
    }

    form.hidden = false
    body.innerHTML = state.market.length
        ? `<table><tr><th>GOOD</th><th>BUY</th><th>SELL</th></tr>${
            state.market.map(m => `<tr><td>${
                esc(good(m.gid)) }</td><td>${
                cr(m.price_buy)  }</td><td>${
                cr(m.price_sell)
            }</td></tr>`).join('')
        }</table>`
        : '<p class="dim">— no goods quoted —</p>'

    const sel  = $('#tradeGood')
    const prev = sel.value
    sel.innerHTML = state.market.map(m =>`<option value="${
        esc(m.gid) }">${
        esc(good(m.gid))
    }</option>`).join('')

    if (state.market.some(m => m.gid === prev))
        sel.value = prev

    updateHint()
}

export function updateHint() {
    const row = state.market.find(m => m.gid === $('#tradeGood').value)
    $('#tradeHint').textContent = row
        ? `buy ≤ ${ cr(row.price_buy * 1.1) } · sell ≥ ${ cr(row.price_sell * 0.9) }`
        : ''
}

export function renderCargo() {
    const body = $('#cargoBody')
    body.innerHTML = state.cargo.length
        ? `<table><tr><th>GOOD</th><th>QTY</th></tr>${
            state.cargo.map(c => `<tr><td>${ esc(good(c.gid)) }</td><td>${ c.quantity }</td></tr>`).join('')
        }</table>`
        : '<p class="dim">hold empty</p>'
}

export function renderTrades() {
    const body = $('#tradesBody')
    body.innerHTML = state.trades.length
        ? `<table><tr><th>SIDE</th><th>QTY</th><th>GOOD</th><th>UNIT</th></tr>${
            state.trades.slice(0, 20).map(t => `
                <tr><td>${ esc(t.side) }</td><td>${ t.quantity }</td><td>${ esc(good(t.gid)) }</td><td>${ cr(t.price_unit) }</td></tr>
            `).join('')
        }</table>`
        : '<p class="dim">no trades yet</p>'
}

export function setConn(text) {
    const con = $('#conn')
    con.textContent = text
    con.className   = text === 'ONLINE' ? 'ok' : 'dim'
}
