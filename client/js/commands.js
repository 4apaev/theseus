/* eslint-disable camelcase */
import { $ } from './dom.js'
import { state, station, good } from './state.js'
import { feedLine, mark } from './feed.js'
import { api } from './api.js'

async function send(path, body, ...a) {
    const label = a.join(' → ')
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

export function travel(to) {
    state.ship?.status === 'docked'
    && send('/travel', {
        to,
        sid: state.ship.sid,
        from: state.ship.stid,
    }, 'travel', station(to))
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
