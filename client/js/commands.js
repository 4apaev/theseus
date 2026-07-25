/* eslint-disable camelcase */
import { $ } from './dom.js'
import { state, station, good } from './state.js'
import { feedLine, mark } from './feed.js'
import { api } from './api.js'

export const buy = transaction.bind('buy',  1.1, 'price_unit_max')
export const sell = transaction.bind('sell', 0.9,  'price_unit_min')

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

/*
export function buy() {
    const { ship } = state
    if (ship?.status !== 'docked')
        return

    const gid = $('#tradeGood').value
    const row = state.market.find(m => m.gid === gid)

    if (!row)
        return

    const quantity = Math.max(1, +$('#tradeQty').value || 1)
    send('/buy', {
        gid,
        sid: ship.sid,
        stid: ship.stid,
        quantity,
        price_unit_max: +(+row.price_buy * 1.1).toFixed(4),
    }, `buy ${ quantity } ${ good(gid) }`)
}

export function sell() {
    const { ship } = state
    if (ship?.status !== 'docked')
        return

    const gid = $('#tradeGood').value
    const row = state.market.find(m => m.gid === gid)

    if (!row)
        return

    const quantity = Math.max(1, +$('#tradeQty').value || 1)
    send('/sell', {
        gid,
        sid: ship.sid,
        stid: ship.stid,
        quantity,
        price_unit_min: +(+row.sell * 0.9).toFixed(4),
    }, `sell ${ quantity } ${ good(gid) }`)
}
 */

function transaction(rate, key) {
    if (state.ship?.status !== 'docked')
        return

    const gid = $('#tradeGood').value
    const row = state.market.find(m => m.gid === gid)

    if (!row)
        return

    const price = +row[ 'price_' + this ] * rate
    const quantity = getQuantity()
    const { sid, stid } = state.ship

    send(`/${ this }`, {
        gid,
        sid,
        stid,
        quantity,
        [ key ]: +price.toFixed(4),
    }, this , quantity , good(gid))
}

function getQuantity() {
    return Math.max(1, +$('#tradeQty').value || 1)
}
