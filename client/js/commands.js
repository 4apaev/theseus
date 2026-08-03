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
