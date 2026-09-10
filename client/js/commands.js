/* eslint-disable camelcase */
import { $ } from './dom.js'
import { state, station, good, fittedAt } from './state.js'
import { feedLine, mark } from './feed.js'
import { api } from './api.js'

// a lost command must not leave a `…` feed line forever - time it out.
const PENDING_TIMEOUT = 15000

const send    = (path, body, ...a) => request('post', path, body, a)
const sendDel = (path, body, ...a) => request('del' , path, body, a)

async function request(method, path, body, a) {
    const label = a.join(' → ')
    const el = feedLine('cmd', `→ ${ label } …`)
    try {
        const { correlation_id } = await api(path, body, method)
        const timer = setTimeout(timedOut, PENDING_TIMEOUT, correlation_id)
        state.pending.set(correlation_id, { label, el, timer })
    }
    catch (e) {
        mark(el, false)
        el.textContent += ` ${ e.message }`
    }
}

function timedOut(coid) {
    const p = state.pending.get(coid)
    if (!p) return // resolved already

    state.pending.delete(coid)
    mark(p.el, false)
    p.el.textContent += ' timed out'
}

function travel(to) {
    state.ship?.status === 'docked'
    && send('/travel', {
        to,
        sid: state.ship.sid,
        from: state.ship.stid,
    }, 'travel', station(to))
}

// a click can commit a ship to several hops - confirm first, no misclicks.
export function confirmTravel() {
    const dialog = $.id('travelDialog')
    travel(dialog.dataset.stid)
    dialog.close()
}

/*  the same rule as field.shipName in the contract. the client checks it
    first, so a bad name gets an answer with no round trip. the contract
    is still the authority. */
const SHIP_NAME = /^[\p{L}\p{N} '.-]{1,24}$/u

export function nameError(name) {
    if (!name) return 'a ship needs a name'
    if (name.length > 24) return 'too long - 24 characters or fewer'
    if (!SHIP_NAME.test(name)) return 'letters, digits, space, and - \' . only'
    return ''
}

export function rename(name) {
    state.ship
    && send('/rename', { name, sid: state.ship.sid }, 'rename', name)
}

/*  install into an occupied slot replaces what is there. there is no
    3rd command - ship-service reads the slot and works out the swap. */
export function installModule(slot, gid) {
    state.ship
    && send('/modules/install', { slot, gid, sid: state.ship.sid }, 'fit', good(gid), slot)
}

export function removeModule(slot) {
    state.ship
    && sendDel('/modules/remove', { slot, sid: state.ship.sid }, 'remove', good(fittedAt(slot)), slot)
}

const RATE = { buy: 1.1, sell: 0.9 }
const KEY  = { buy: 'price_unit_max', sell: 'price_unit_min' }

export function confirmTrade() {
    const dialog = $('#tradeDialog')
    const { side, gid } = dialog.dataset
    const quantity = Math.max(1, +$('#tradeQty').value || 1)

    trade(side, gid, quantity)
    dialog.close()
}

function trade(side, gid, quantity) {
    const { ship } = state
    if (ship?.status !== 'docked')
        return

    const row = state.market.find(m => m.gid === gid)
    if (!row)
        return

    const price = +row[ 'price_' + side ] * RATE[ side ]

    send(`/${ side }`, {
        gid,
        sid: ship.sid,
        stid: ship.stid,
        quantity,
        [ KEY[ side ] ]: +price.toFixed(4),
    }, side, quantity, good(gid))
}
