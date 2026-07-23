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
    assert.equal(universe.distance('sol.outpost', 'alpha.exchange'), 4.3)
    assert.equal(universe.distance('alpha.exchange', 'sol.outpost'), 4.3)
    assert.equal(universe.distance('barnards.port', 'sol.outpost'), 6.0)
})

test('distance throws on unknown route or station', () => {
    assert.throws(() => universe.distance('sol.outpost', 'lost.harbor'), /unknown route/)
    assert.throws(() => universe.distance('lost.harbor', 'sol.outpost'), /unknown station/)
})

test('neighbors lists direct routes', () => {
    const near = universe.neighbors('sol.outpost')
    assert.equal(near.size, 2)
    assert.equal(near.get('alpha.exchange'), 4.3)
    assert.equal(near.get('barnards.port'), 6.0)
})

test('link rejects unknown stations', () => {
    const u = new Universe
    u.node('a')
    assert.throws(() => u.link('a', 'b', 1), /unknown station/)
})

test('toJSON flattens stations and both directions of every link', () => {
    const u = new Universe
    u.node('a', { name: 'Alpha' })
    u.node('b', { name: 'Beta' })
    u.link('a', 'b', 2.5)

    const { stations, routes } = u.toJSON()

    assert.equal(stations.length, 2)
    assert.equal(stations.find(s => s.stid === 'a').name, 'Alpha')
    assert.equal(stations.find(s => s.stid === 'b').name, 'Beta')
    assert.equal(routes.length, 2)
    assert.ok(routes.some(r => r.from === 'a' && r.to === 'b' && r.ly === 2.5))
    assert.ok(routes.some(r => r.from === 'b' && r.to === 'a' && r.ly === 2.5))
})

test('every good is produced somewhere and consumed somewhere else', () => {
    for (const gid of Object.keys(goods)) {
        const makers = universe.nodes.values().filter(n => n.produces?.[ gid ]).toArray()
        const takers = universe.nodes.values().filter(n => n.consumes?.[ gid ]).toArray()

        assert.equal(makers.length, 1, `${ gid } has a producer`)
        assert.equal(takers.length, 1, `${ gid } has a consumer`)
        assert.notEqual(makers[ 0 ].stid, takers[ 0 ].stid, `${ gid } must be shipped`)
    }
})

test('starter ship is docked at a known station and can fly', () => {
    assert.ok(universe.has(starterShip.stid))
    assert.ok(starterShip.velocity > 0 && starterShip.velocity < 1)
    assert.ok(starterShip.capacity > 0)
})

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
