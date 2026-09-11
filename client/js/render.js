import { api } from './api.js'
import { $, esc, cr, fmtYears, fmtVel } from './dom.js'
import { state, station, good, design, hull, fittedAt, volume, cargoLoad } from './state.js'
import { dockedAt } from './traffic.js'
import { rename, nameError, installModule, removeModule } from './commands.js'
import { renderTravel, tickShipMarkers } from './map.js'

export function renderAll() {
    renderWallet()
    renderShip()
    renderTravel()
    renderPort()
    renderMarket()
    renderRig()
    renderCargo()
    renderTrades()
}

// who else is docked where we are
export function renderPort() {
    const body = $.id('portBody')

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
    const body = $.id('walletBody')
    body.replaceChildren()

    if (!state.me)
        return body.append($.of('p', { class: 'dim' }, '—'))

    body.append(
        $.of('p', { class: 'money' }, cr(state.me.balance)),
        $.of('p', { class: 'dim' }, `${ state.me.handle } · ${ state.me.pid }`))
}

export function renderShip() {
    const body = $.id('shipBody')
    const ship = state.ship

    if (!ship)
        return body.innerHTML = '<p class="dim">awaiting ship commission…</p>'

    if (ship.status === 'docked') {
        return body.innerHTML = `
            <p>${ shipName(ship) } · docked at ${ esc(station(ship.stid)) }</p>
            <p class="dim">cap ${ ship.capacity } · v ${ ship.velocity }c ·
               hold ${ cargoLoad() }/${ ship.capacity }</p>`
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
    const dialog = $.id('nameDialog')
    $.id('nameInput').value = state.ship?.name ?? ''
    $.id('nameMsg').textContent = ''
    dialog.showModal()
    $.id('nameInput').focus()
}

export function confirmName() {
    const name = $.id('nameInput').value.trim()
    const err  = nameError(name)

    if (err) return $.id('nameMsg').textContent = err

    rename(name)
    $.id('nameDialog').close()
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
    const el = $.id('eta')
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
    const body = $.id('marketBody')

    if (!state.ship || state.ship.status !== 'docked')
        return body.innerHTML = '<p class="dim">— in transit · market offline —</p>'

    body.innerHTML = state.market.length
        ? `<table><tr><th>GOOD</th><th>VOL</th><th>BUY</th><th>SELL</th></tr>${
            state.market.map(m => `<tr><td>${
                esc(good(m.gid)) }</td><td class="dim">${ volume(m.gid) }</td><td>${
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

    const dialog = $.id('tradeDialog')
    dialog.dataset.side = side
    dialog.dataset.gid  = gid

    $.id('tradeTitle').textContent = `${ good(gid) } — ${ side.toUpperCase() }`
    $.id('tradeQty').value = 1
    updateTradeTotal()
    dialog.showModal()
}

export function updateTradeTotal() {
    const { side, gid } = $.id('tradeDialog').dataset
    const row = state.market.find(m => m.gid === gid)
    const qty = Math.max(1, +$.id('tradeQty').value || 1)
    $.id('tradeTotal').textContent = row ? cr(row[ 'price_' + side ] * qty) : ''
    renderTradeHold(side, gid, qty)
}

// a buy adds volume to the hold. this function shows that math
// before the player confirms. as a result, a reject for over
// capacity is never a surprise.
function renderTradeHold(side, gid, qty) {
    const el = $.id('tradeHold')
    if (side !== 'buy') return el.textContent = ''

    const cap   = state.ship?.capacity ?? 0
    const added = qty * volume(gid)
    const next  = cargoLoad() + added

    el.textContent = `+${ added } vol · hold ${ next }/${ cap }`
    el.className   = next > cap ? 'err' : 'dim'
}

// ── rig ─────────────────────────────────────────────────────────────────────

export function renderRig() {
    const body = $.id('rigBody')
    const ship = state.ship
    const h    = hull()

    if (!ship || !h)
        return body.innerHTML = '<p class="dim">no rig</p>'

    body.innerHTML = rigStats(ship) + slotTable(h)
}

function rigStats(ship) {
    return `<p class="dim">${ esc(ship.hull) } hull · rig ${ ship.rig }`
        + ` · cap ${ ship.capacity } · v ${ fmtVel(ship.velocity) }c`
        + ` · pwr ${ ship.power }/${ ship.power_pool }</p>`
}

function slotTable(h) {
    return '<table><tr><th>SLOT</th><th>MODULE</th><th></th></tr>'
        + h.slots.map(slotRow).join('')
        + '</table>'
}

function slotRow(slot) {
    const gid = fittedAt(slot.id)
    return `<tr><td>${ esc(slot.id) } <span class="dim">${ esc(slot.size) }</span></td><td>${
        gid ? moduleCell(gid) : '<span class="dim">— empty —</span>'
    }</td><td>${ fitBtn(slot.id, gid ? 'SWAP' : 'FIT') }</td></tr>`
}

function moduleCell(gid) {
    const d = design(gid)
    return `${ esc(good(gid)) }<span class="dim"> · ${
        esc(d?.mount ?? '?') } · ${ d?.power ?? 0 }pwr${ provided(d) }</span>`
}

function provided(d) {
    return d?.provides?.length
        ? ' · ' + esc(d.provides.map(r => `${ r.rate } ${ r.rank }`).join(', '))
        : ''
}

function fitBtn(slot, text) {
    return `<button type="button" class="fitBtn" data-slot="${ esc(slot) }">${ text }</button>`
}

// ── the fit dialog ──────────────────────────────────────────────────────────

export function openFitDialog(slot) {
    const dialog = $.id('fitDialog')
    dialog.dataset.slot = slot
    delete dialog.dataset.gid

    $.id('fitTitle').textContent   = `RIG — ${ slot.toUpperCase() }`
    $.id('fitBody').innerHTML      = fitChoices(slot)
    $.id('fitPreview').textContent = ''
    $.id('fitMsg').textContent     = ''
    $.id('fitConfirmBtn').disabled = true
    dialog.showModal()
}

function fitChoices(slot) {
    const gid = fittedAt(slot)
    return (gid
        ? `<p>fitted: ${ esc(good(gid)) } ${ pickBtn('remove', 'REMOVE') }</p>`
        : '<p class="dim">slot empty</p>') + carried()
}

/*  every module in the hold shows, compatible or not. the preview
    answers why one does not fit - the client never hides the choice. */
function carried() {
    const rows = state.cargo.filter(c => state.universe?.goods[ c.gid ]?.kind === 'module')
    return rows.length
        ? `<table>${ rows.map(carriedRow).join('') }</table>`
        : '<p class="dim">no modules in the hold</p>'
}

function carriedRow(c) {
    const d = design(c.gid)
    return `<tr><td>${ esc(good(c.gid)) }</td><td class="dim">${
        esc(d?.family ?? '?') } · ${ d?.power ?? 0 }pwr</td><td>${
        pickBtn(c.gid, 'FIT') }</td></tr>`
}

function pickBtn(pick, text) {
    return `<button type="button" class="pickBtn" data-pick="${ esc(pick) }">${ text }</button>`
}

// preview is advisory - the command itself remains the final judge
export async function pickFit(pick) {
    const dialog = $.id('fitDialog')
    pick === 'remove'
        ? delete dialog.dataset.gid
        : dialog.dataset.gid = pick

    const { slot, gid } = dialog.dataset
    try {
        const p = await api('/modules/preview', { sid: state.ship.sid, slot, gid })
        $.id('fitPreview').textContent = previewLine(state.ship, p)
        $.id('fitMsg').textContent     = p.errors.join(' · ')
        $.id('fitConfirmBtn').disabled = p.errors.length > 0
    }
    catch (e) {
        $.id('fitPreview').textContent = ''
        $.id('fitMsg').textContent     = e.message
        $.id('fitConfirmBtn').disabled = true
    }
}

function previewLine(ship, p) {
    return `cap ${ ship.capacity } → ${ p.capacity }`
        + ` · v ${ fmtVel(ship.velocity) } → ${ fmtVel(p.velocity) }c`
        + ` · pwr ${ ship.power }/${ ship.power_pool } → ${ p.power }/${ p.power_pool }`
        + ` · hold ${ p.load }/${ p.capacity }`
}

export function confirmFit() {
    const dialog = $.id('fitDialog')
    const { slot, gid } = dialog.dataset

    gid ? installModule(slot, gid) : removeModule(slot)
    dialog.close()
}

export function renderCargo() {
    const body   = $.id('cargoBody')
    const docked = state.ship?.status === 'docked'

    body.innerHTML = state.cargo.length
        ? `<table><tr><th>GOOD</th><th>QTY</th><th>VOL</th><th>SELL</th></tr>${
            state.cargo.map(c => {
                const row = docked && state.market.find(m => m.gid === c.gid)
                return `<tr><td>${ esc(good(c.gid)) }</td><td>${ c.quantity }</td><td class="dim">${
                    c.quantity * volume(c.gid) }</td><td>${
                    row ? tradeBtn('sell', c.gid, row.price_sell) : ''
                }${ cargoFitBtn(c.gid) }</td></tr>`
            }).join('')
        }</table>`
        : '<p class="dim">hold empty</p>'
}

/*  a module in the hold can go straight into a slot of its own family.
    a commodity, and a module with no matching slot, get no action. */
function cargoFitBtn(gid) {
    const slot = hull()?.slots.find(s => s.family === design(gid)?.family)
    return slot ? fitBtn(slot.id, 'FIT') : ''
}

export function renderTrades() {
    const body = $.id('tradesBody')
    body.innerHTML = state.trades.length
        ? `<table><tr><th>SIDE</th><th>QTY</th><th>GOOD</th><th>UNIT</th></tr>${
            state.trades.slice(0, 20).map(t => `
                <tr><td>${ esc(t.side) }</td><td>${ t.quantity }</td><td>${ esc(good(t.gid)) }</td><td>${ cr(t.price_unit) }</td></tr>
            `).join('')
        }</table>`
        : '<p class="dim">no trades yet</p>'
}

export function setConn(text) {
    const con = $.id('conn')
    con.textContent = text
    con.className   = text === 'ONLINE' ? 'ok' : 'dim'
}
