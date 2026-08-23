import test   from 'node:test'
import assert from 'node:assert/strict'

import '#packages/testing/src/index.js?title=🧪 🧮 DOMAIN'

import {
    universe,
    Universe,
    goods,
    starterShip,
    price,
    spread,
    gameSeconds,
    capitalCost,
} from '@theseus/domain'

// ── universe graph ────────────────────────────────────────────────────────────

test('universe knows its stations', () => {
    assert.ok(universe.has('sol.outpost'))
    assert.ok(universe.has('alpha.exchange'))
    assert.ok(universe.has('barnards.port'))
    assert.ok(!universe.has('lost.harbor'))
})

test('distance is direction independent', () => {
    assert.equal(universe.distance('sol.outpost', 'alpha.exchange'), 4.32)
    assert.equal(universe.distance('alpha.exchange', 'sol.outpost'), 4.32)
    assert.equal(universe.distance('barnards.port', 'sol.outpost'), 5.95)
})

test('distance throws on unknown route or station', () => {
    assert.throws(() => universe.distance('sol.outpost', 'lost.harbor'), /unknown route/)
    assert.throws(() => universe.distance('lost.harbor', 'sol.outpost'), /unknown station/)
})

test('neighbors lists direct routes', () => {
    const near = universe.neighbors('sol.outpost')
    assert.equal(near.get('alpha.exchange').ly, 4.32)
    assert.equal(near.get('barnards.port').ly, 5.95)
    assert.ok(near.has('sol.titan'), 'the gateway also links inside its system')
})

test('link rejects unknown stations', () => {
    const u = toy()
    assert.throws(() => u.link('a', 'c', 1), /unknown station/)
})

test('node rejects an unknown system', () => {
    const u = new Universe
    assert.throws(() => u.node('a', { system: 'nowhere' }), /unknown system/)
    assert.throws(() => u.node('a'), /unknown system/)
})

test('toJSON flattens systems, stations and both directions of every link', () => {
    const u = toy()
    const { systems, stations, routes } = u.toJSON()

    assert.equal(systems.length, 1)
    assert.equal(systems[ 0 ].sysid, 's')
    assert.equal(stations.length, 2)
    assert.equal(stations.find(s => s.stid === 'a').name, 'Alpha')
    assert.equal(stations.find(s => s.stid === 'b').name, 'Beta')
    assert.equal(routes.length, 2)
    assert.ok(routes.some(r => r.from === 'a' && r.to === 'b' && r.ly === 2.5))
    assert.ok(routes.some(r => r.from === 'b' && r.to === 'a' && r.ly === 2.5))
})

// ── systems ───────────────────────────────────────────────────────────────────

test('every station names a system that exists', () => {
    for (const st of universe.nodes.values())
        assert.ok(universe.systems.has(st.system), `${ st.stid } → ${ st.system }`)
})

test('sol holds the planets, the other stars hold one station each', () => {
    const of = sysid => universe.nodes.values().filter(n => n.system === sysid).toArray()

    assert.ok(of('sol').length > 1, 'sol is built out')
    assert.equal(of('sirius').length, 1)
    assert.equal(universe.nodes.get('sol.mars').system, 'sol')
})

// ── route speed limit ─────────────────────────────────────────────────────────

test('a route between stars leaves the speed to the ship', () => {
    assert.equal(universe.speedLimit('sol.outpost', 'alpha.exchange'), 1)
})

test('a route inside a system caps the speed well below light', () => {
    const c = universe.speedLimit('sol.mars', 'sol.venus')
    assert.ok(c > 0 && c < 0.001, `sublight, got ${ c }`)
    assert.equal(c, universe.speedLimit('sol.venus', 'sol.mars'), 'both directions')
})

test('an in-system hop is far shorter than a light year', () => {
    const ly = universe.distance('sol.mercury', 'sol.venus')
    assert.ok(ly > 0 && ly < 0.001, `got ${ ly }`)
})

// ── goods ─────────────────────────────────────────────────────────────────────

test('every good is produced somewhere and consumed somewhere else', () => {
    for (const gid of Object.keys(goods)) {
        const makers = universe.nodes.values().filter(n => n.produces?.[ gid ]).toArray()
        const takers = universe.nodes.values().filter(n => n.consumes?.[ gid ]).toArray()

        assert.ok(makers.length, `${ gid } has a producer`)
        assert.ok(takers.length, `${ gid } has a consumer`)
        assert.ok(makers.some(m => !takers.some(t => t.stid === m.stid)),
            `${ gid } must be shipped`)
    }
})

test('no station both makes and takes the same good', () => {
    for (const st of universe.nodes.values()) {
        for (const gid of Object.keys(st.produces ?? {}))
            assert.ok(!st.consumes?.[ gid ], `${ st.stid } loops ${ gid }`)
    }
})

test('starter ship is docked at a known station and can fly', () => {
    assert.ok(universe.has(starterShip.stid))
    assert.ok(starterShip.velocity > 0 && starterShip.velocity < 1)
    assert.ok(starterShip.capacity > 0)
})

// a small universe, so a test does not lean on the real one
function toy() {
    const u = new Universe
    u.system('s', { name: 'Toy' })
    u.node('a', { system: 's', name: 'Alpha' })
    u.node('b', { system: 's', name: 'Beta' })
    u.link('a', 'b', 2.5)
    return u
}

// ── economy ───────────────────────────────────────────────────────────────────

test('price equals base when stock is on target', () => {
    assert.equal(price(40, 10, 10), 40)
})

test('scarcity raises price, glut lowers it', () => {
    assert.ok(price(40, 2, 10) > 40, 'stock below target → dearer')
    assert.ok(price(40, 50, 10) < 40, 'glut → cheaper')
})

test('elasticity amplifies the swing', () => {
    const gentle = price(40, 2, 10, 1)
    const steep  = price(40, 2, 10, 1.5)
    assert.ok(steep > gentle)
})

test('empty stock does not divide by zero', () => {
    assert.equal(price(40, 0, 10), price(40, 1, 10))
})

test('spread puts station ask above bid', () => {
    const { price_buy: buy, price_sell: sell } = spread(100, 0.1)
    assert.equal(sell, 90)
    assert.ok(buy > 100 && sell < 100)
    assert.ok(sell < buy, 'no free arbitrage at one station')
})

test('price and spread reject bad input', () => {
    assert.throws(() => price(-1, 1, 1))
    assert.throws(() => price(40, -1, 10))
    assert.throws(() => spread(100, 1.5))
})
