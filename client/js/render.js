import { $, esc, cr, fmtYears } from './dom.js'
import { state, station, good } from './state.js'
import { dockedAt } from './traffic.js'
import { rename, nameError } from './commands.js'
import { renderTravel, tickShipMarkers } from './map.js'

export function renderAll() {
    renderWallet()
    renderShip()
    renderTravel()
    renderPort()
    renderMarket()
    renderCargo()
    renderTrades()
}

// who else is docked where we are
export function renderPort() {
    const body = $('#portBody')

    if (state.ship?.status !== 'docked')
        return body.innerHTML = '<p class="dim">— in transit —</p>'

    const crew = dockedAt(state.ship.stid)
    body.innerHTML = crew.length
        ? `<table><tr><th>PILOT</th><th>SHIP</th></tr>${
            crew.map(t => `<tr><td>${ esc(t.handle ?? '—') }</td><td class="shipName">${ esc(t.name) }</td></tr>`).join('')
        }</table>`
        : '<p class="dim">no other ships in port</p>'
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
            <p>${ shipName(ship) } · docked at ${ esc(station(ship.stid)) }</p>
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

// the name itself opens the dialog
function shipName(ship) {
    return `<span id="renameBtn" class="shipName" title="rename">"${ esc(ship.name) }"</span>`
}

export function openNameDialog() {
    const dialog = $('#nameDialog')
    $('#nameInput').value = state.ship?.name ?? ''
    $('#nameMsg').textContent = ''
    dialog.showModal()
    $('#nameInput').focus()
}

export function confirmName() {
    const name = $('#nameInput').value.trim()
    const err  = nameError(name)

    if (err) return $('#nameMsg').textContent = err

    rename(name)
    $('#nameDialog').close()
}

export function openTravelDialog(stid) {
    const dialog = $.id('travelDialog')
    dialog.dataset.stid = stid
    $.id('travelTitle').textContent = `TRAVEL TO ${ station(stid).toUpperCase() }?`
    dialog.showModal()
}

export function tickEta() {
    if (state.ship?.status === 'transit')
        tickCountdown(state.ship)
    tickShipMarkers()          // every ship moves, not only ours
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

    if (!state.ship || state.ship.status !== 'docked')
        return body.innerHTML = '<p class="dim">— in transit · market offline —</p>'

    body.innerHTML = state.market.length
        ? `<table><tr><th>GOOD</th><th>BUY</th><th>SELL</th></tr>${
            state.market.map(m => `<tr><td>${
                esc(good(m.gid)) }</td><td>${
                tradeBtn('buy',  m.gid, m.price_buy)  }</td><td>${
                tradeBtn('sell', m.gid, m.price_sell)
            }</td></tr>`).join('')
        }</table>`
        : '<p class="dim">— no goods quoted —</p>'
}

function tradeBtn(side, gid, price) {
    return `<button type="button" class="tradeBtn" data-side="${
        side }" data-gid="${ esc(gid) }">${ cr(price) }</button>`
}

export function openTradeDialog(side, gid) {
    const row = state.market.find(m => m.gid === gid)
    if (!row) return

    const dialog = $('#tradeDialog')
    dialog.dataset.side = side
    dialog.dataset.gid  = gid

    $('#tradeTitle').textContent = `${ good(gid) } — ${ side.toUpperCase() }`
    $('#tradeQty').value = 1
    updateTradeTotal()
    dialog.showModal()
}

export function updateTradeTotal() {
    const { side, gid } = $('#tradeDialog').dataset
    const row = state.market.find(m => m.gid === gid)
    const qty = Math.max(1, +$('#tradeQty').value || 1)
    $('#tradeTotal').textContent = row ? cr(row[ 'price_' + side ] * qty) : ''
}

export function renderCargo() {
    const body   = $('#cargoBody')
    const docked = state.ship?.status === 'docked'

    body.innerHTML = state.cargo.length
        ? `<table><tr><th>GOOD</th><th>QTY</th><th>SELL</th></tr>${
            state.cargo.map(c => {
                const row = docked && state.market.find(m => m.gid === c.gid)
                return `<tr><td>${ esc(good(c.gid)) }</td><td>${ c.quantity }</td><td>${
                    row ? tradeBtn('sell', c.gid, row.price_sell) : ''
                }</td></tr>`
            }).join('')
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
