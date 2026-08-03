import { cr, fmtYears         } from './dom.js'
import { api, refreshMarket   } from './api.js'
import { state, station, good } from './state.js'
import { feedLine, mark       } from './feed.js'
import { renderAll            } from './render.js'

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
    if (i === -1)
        return delta > 0 && state.cargo.push({ gid, quantity: delta })
    state.cargo[ i ].quantity += delta
    state.cargo[ i ].quantity <= 0 && state.cargo.splice(i, 1)
}

async function shipCreated() {
    const [ ship ] = await api('/ships')
    state.ship = ship
    await refreshMarket()
}

function shipDeparted(p) {
    Object.assign(state.ship, {
        to: p.to,
        from: p.from,
        stid: void 0,
        status: 'transit',
        arrives: p.arrives,
        years_abs: p.years_abs,
        years_rel: p.years_rel,
    })
    state.market = []
}

async function shipArrived(p) {
    Object.assign(state.ship, {
        to: void 0,
        from: void 0,
        stid: p.stid,
        status: 'docked',
        arrives: void 0,
    })
    await refreshMarket()
}

function cargoLoaded(p)         { mutateCargo(p.gid,  p.quantity) }
function cargoUnloaded(p)       { mutateCargo(p.gid, -p.quantity) }
function marketTradeExecuted(p) { state.trades.unshift({ ...p, created: (new Date).toISOString() }) }

function walletDebited(p)  { if (state.me) state.me.balance = Number(p.balance) }
function walletCredited(p) { if (state.me) state.me.balance = Number(p.balance) }
function marketPriceChanged(p) {
    if (!state.ship || p.stid !== state.ship.stid) return
    const i   = state.market.findIndex(m => m.gid === p.gid)
    const row = { gid: p.gid, price_buy: p.price_buy, price_sell: p.price_sell }
    i === -1 ? state.market.push(row) : state.market[ i ] = row
}

const mutate = {
    'ship.created.v1'          : shipCreated,
    'ship.departed.v1'         : shipDeparted,
    'ship.arrived.v1'          : shipArrived,
    'cargo.loaded.v1'          : cargoLoaded,
    'cargo.unloaded.v1'        : cargoUnloaded,
    'market.trade.executed.v1' : marketTradeExecuted,
    'wallet.debited.v1'        : walletDebited,
    'wallet.credited.v1'       : walletCredited,
    'market.price.changed.v1'  : marketPriceChanged,
}

export async function dispatch(e) {
    const { kind, text } = flavor(e)
    const line = feedLine(kind, text)

    const key = e.event_type
    const coid = e.correlation_id

    if (coid && state.pending.has(coid)) {
        const p = state.pending.get(coid)
        line.textContent += ` [${ p.label }]`
        mark(p.el, kind !== 'err')
        state.pending.delete(coid)
    }

    key in mutate
        && await mutate[ key ](e.payload)

    renderAll()
}
