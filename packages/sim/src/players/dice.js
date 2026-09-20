import { universeData } from '@theseus/domain'
import { O, each } from '@theseus/util'

/*
    the dice player. it picks an action by weight and fills the fields at
    random. it never carries cargo to a station that pays more, so it
    loses the spread on every round trip. that is the reason for an agent
    player - same harness, a different turn().

    a player module exports turn(player, peers, stats).
*/

const GOODS = new Set([ 'ore', 'grain', 'spice' ])
const DOCKED_ONLY = new Set([ 'buy', 'sell', 'travel', 'install', 'remove' ])
const TRANSIT_POLL = 2000

const links = universeData.routes

export const ACTIONS = {
    buy    : 30,
    sell   : 25,
    travel : 15,
    preview: 10,
    install: 8,
    remove : 4,
    message: 8,
}

const FX = {
    buy,
    sell,
    travel,
    preview,
    install,
    remove,
    message,
}

export function pickWeighted(rand, weights) {
    let total = 0
    each(weights, (k, v) => total += v)

    let n = rand() * total
    let last = ''

    // each() never breaks early, and this one stops at the first hit
    for (const [ k, w ] of O.tuple(weights)) {
        last = k
        if ((n -= w) <= 0) return k
    }
    return last
}

function stationsOf(stid) {
    return links.filter(r => r.from === stid).map(r => r.to)
}

async function buy(p) {
    const s = p.ship
    const { body: rows } = await p.req('GET', `/api/station/${ s.stid }/market`)
    const row = choice(p.rand, rows.filter(r => GOODS.has(r.gid)))
    if (!row) return

    const rs = await p.req('POST', '/api/market/buy', {
        gid: row.gid,
        sid: s.sid,
        stid: s.stid,
        quantity: 1 + Math.floor(p.rand() * 5),
        price_unit_max: +(Number(row.price_buy) * 1.2).toFixed(4),
    })
    p.track('buy', rs.body)
}

async function sell(p) {
    const s = p.ship
    const { body: cargo } = await p.req('GET', `/api/ship/${ s.sid }/cargo`)
    const held = choice(p.rand, cargo.filter(c => Number(c.quantity) > 0))
    if (!held) return

    const { body: rows } = await p.req('GET', `/api/station/${ s.stid }/market`)
    const row = rows.find(r => r.gid === held.gid)
    if (!row) return

    const rs = await p.req('POST', '/api/market/sell', {
        gid: held.gid,
        sid: s.sid,
        stid: s.stid,
        quantity: Math.max(1, Math.floor(Number(held.quantity) * p.rand()) || 1),
        price_unit_min: +(Number(row.price_sell) * 0.8).toFixed(4),
    })
    p.track('sell', rs.body)
}

async function travel(p) {
    const s = p.ship
    const to = choice(p.rand, stationsOf(s.stid))
    if (!to) return

    const rs = await p.req('POST', `/api/ship/${ s.sid }/travel`, { from: s.stid, to })
    p.track('travel', rs.body)
}

async function preview(p) {
    const slot = choice(p.rand, [ 'power1', 'cruise1', 'maneuver1', 'cargo1', 'utility1' ])
    await p.req('POST', `/api/ship/${ p.ship.sid }/modules/preview`, {
        slot,
        gid: choice(p.rand, [ 'reactor.mk2', 'cargo.mk2', 'cruise.mk2' ]),
    })
}

async function install(p) {
    const slot = choice(p.rand, [ 'power1', 'cruise1', 'maneuver1', 'cargo1' ])
    const gid  = choice(p.rand, [ 'reactor.mk2', 'cruise.mk2', 'maneuver.mk2', 'cargo.mk2' ])
    const rs = await p.req('PUT', `/api/ship/${ p.ship.sid }/modules/${ slot }`, { gid })
    p.track('install', rs.body)
}

async function remove(p) {
    const slot = choice(p.rand, [ 'power1', 'cruise1', 'maneuver1', 'cargo1' ])
    const rs = await p.req('DELETE', `/api/ship/${ p.ship.sid }/modules/${ slot }`)
    p.track('remove', rs.body)
}

async function message(p, peers) {
    const mate = choice(p.rand, peers.filter(x => x !== p && x.ship))
    const rs = await p.req('POST', '/api/comms/messages', {
        ...(mate && { to: mate.ship.sid }),
        body: `sim ${ p.handle } → ${ mate?.handle ?? 'station' }`,
    })
    p.track('message', rs.body)
}

// util's own pick() takes keys off an object - this one takes one item off a list
function choice(rand, list) {
    return list?.length ? list[ Math.floor(rand() * list.length) ] : void 0
}

export async function turn(p, peers, stats) {
    // a ship in transit arrives on its own clock. check it, but not every turn
    p.ship?.status !== 'docked'
    && Date.now() - p.polled > TRANSIT_POLL
    && (p.stale = true)

    await p.hydrate()
    if (!p.ship) return

    const action = pickWeighted(p.rand, ACTIONS)
    if (DOCKED_ONLY.has(action) && p.ship.status !== 'docked')
        return

    stats.ask(action)
    try {
        await FX[ action ](p, peers)
    }
    catch (e) {
        stats.error(action, 0, e.message)
    }
}
