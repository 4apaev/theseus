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
    randomShipName,
    hulls,
    modules,
    starterRig,
    Fitting,
    previewRig,
    deriveStats,
    cargoLoad,
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

// ── path() ───────────────────────────────────────────────────────────────────

test('path rejects unknown stations or a bad velocity', () => {
    assert.throws(() => universe.path('lost.harbor', 'sol.outpost', 0.6), /unknown station/)
    assert.throws(() => universe.path('sol.outpost', 'lost.harbor', 0.6), /unknown station/)
    assert.throws(() => universe.path('sol.outpost', 'sol.mars', 0), /velocity/)
    assert.throws(() => universe.path('sol.outpost', 'sol.mars', -1), /velocity/)
})

test('path from a station to itself is the station alone', () => {
    assert.deepEqual(universe.path('sol.outpost', 'sol.outpost', 0.6), [ 'sol.outpost' ])
})

test('path returns null when no route connects the 2 stations', () => {
    const u = weighted()
    u.node('d', { system: 'w', name: 'D' }) // no link to a, b or c
    assert.equal(u.path('a', 'd', 0.5), void 0)
})

/*  a slow ship, and a route that saves distance but not time, so a
    shortest-ly search and a shortest-time search must disagree to
    prove which one path() actually runs.

    a→c direct is 4 ly, uncapped (c: 1) - a fast ship flies it at its
    own speed. a→b→c is 2 ly total, but both legs cap at 0.1c - a ship
    faster than that cap gains nothing from the shorter distance. */
function weighted() {
    const u = new Universe
    u.system('w', { name: 'Weighted' })
    u.node('a', { system: 'w', name: 'A' })
    u.node('b', { system: 'w', name: 'B' })
    u.node('c', { system: 'w', name: 'C' })
    u.link('a', 'c', 4, 1)
    u.link('a', 'b', 1, 0.1)
    u.link('b', 'c', 1, 0.1)
    return u
}

test('a ship slower than the cap takes the shorter route - ly and time agree', () => {
    // velocity 0.05 < both caps: direct time 4/0.05=80, via b 1/0.05*2=40
    assert.deepEqual(weighted().path('a', 'c', 0.05), [ 'a', 'b', 'c' ])
})

test('a ship faster than the cap takes the longer route - it is faster in time', () => {
    // velocity 0.5 > the 0.1 cap: direct time 4/0.5=8, via b 1/0.1*2=20
    // via b covers less ground (2 ly vs 4) but the cap makes it slower -
    // a search that weighs by ly would pick it anyway, and be wrong
    assert.deepEqual(weighted().path('a', 'c', 0.5), [ 'a', 'c' ])
})

// ── goods ─────────────────────────────────────────────────────────────────────

// module goods are seeded to stations in phase 3's market-service work
// (docs/modules.md: "module markets are sparse... availability follows
// station production and specialization") - this checks arbitrage only
// for the commodities that are seeded everywhere today.
test('every commodity is produced somewhere and consumed somewhere else', () => {
    for (const gid of Object.keys(goods).filter(gid => goods[ gid ].kind === 'commodity')) {
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

// ── ship names ───────────────────────────────────────────────────────────────

test('randomShipName always returns a name', () => {
    for (let i = 0; i < 50; i++) {
        const name = randomShipName()
        assert.equal(typeof name, 'string')
        assert.ok(name.length > 0)
    }
})

test('randomShipName varies', () => {
    const names = new Set(Array.from({ length: 50 }, randomShipName))
    assert.ok(names.size > 1, 'not the same name every time')
})

// ── ship modules ─────────────────────────────────────────────────────────────

test('every good declares a kind and a packaged volume', () => {
    for (const g of Object.values(goods)) {
        assert.ok(g.kind === 'commodity' || g.kind === 'module', g.name)
        assert.ok(g.volume > 0, g.name)
    }
})

test('every module design joins a real good by gid', () => {
    for (const gid of Object.keys(modules))
        assert.ok(goods[ gid ], `${ gid } has no matching good`)
})

test('starter rig resolves to todays capacity and velocity, before any upgrade', () => {
    const stats = deriveStats(hulls.starter, starterRig)
    assert.equal(stats.capacity, 20)
    assert.equal(stats.velocity, 0.6)
})

test('power tracks reactor supply against every fitted modules draw', () => {
    const { power } = deriveStats(hulls.starter, starterRig)
    assert.equal(power.available, 8) // hull 3 + reactor.mk1 +5
    assert.equal(power.used, 2)      // reactor 1 + cruise 1 + cargo 0
})

test('installing into an occupied slot replaces it, not a second slot', () => {
    const { proposed, errors } = previewRig(
        hulls.starter, starterRig,
        { type: 'install', slot: 'power1', gid: 'reactor.mk2' },
        { docked: true },
    )
    assert.deepEqual(errors, [])
    assert.equal(proposed.power1, 'reactor.mk2')
    assert.equal(Object.keys(proposed).length, 3, 'still one module per slot')
})

test('a faster drive is gated on the reactors rate, not on owning the old drive', () => {
    const stuck = previewRig(
        hulls.starter,
        starterRig,
        { type: 'install', slot: 'cruise1', gid: 'cruise.mk2' },
        { docked: true },
    )
    assert.ok(stuck.errors.some(e => e.includes('power')), 'reactor.mk1 only grants power rank 1')

    const withBetterReactor = { ...starterRig, power1: 'reactor.mk2' }
    const fitted = previewRig(
        hulls.starter, withBetterReactor,
        { type: 'install', slot: 'cruise1', gid: 'cruise.mk2' },
        { docked: true },
    )
    assert.deepEqual(fitted.errors, [])
    assert.ok(fitted.stats.velocity > 0.6, 'the percent bonus raised velocity')
})

test('removing a module empties its slot', () => {
    const { proposed, errors } = previewRig(
        hulls.starter, starterRig,
        { type: 'remove', slot: 'cargo1' },
        { docked: true },
    )
    assert.deepEqual(errors, [])
    assert.ok(!('cargo1' in proposed))
})

test('removing an empty slot fails', () => {
    const fitted = { ...starterRig }
    delete fitted.cargo1

    const { errors } = previewRig(hulls.starter, fitted, { type: 'remove', slot: 'cargo1' }, { docked: true })
    assert.ok(errors.some(e => e.includes('nothing fitted')))
})

// a small hull + catalogue, isolated from the real one. the resolver
// takes any catalogue via `new Fitting(catalog)` - see below.
function toyHull(overrides = {}) {
    return {
        capacity_base: 0, velocity_base: 0, power_base: 5, rates: [],
        slots: [
            { id: 'small', family: 'cargo', size: 'light' },
            { id: 'big',   family: 'cargo', size: 'medium' },
            { id: 'plug',  family: 'power', size: 'light' },
        ],
        ...overrides,
    }
}

const toyCatalog = {
    fits    : part({ family: 'cargo', mount: 'light'  }),
    tooBig  : part({ family: 'cargo', mount: 'medium' }),
    wrongFam: part({ family: 'power', mount: 'light'  }),
    hungry  : part({ family: 'cargo', mount: 'light', power: 20 }),
    inField : part({ family: 'cargo', mount: 'light', context: 'field' }),
    flat10  : part({ family: 'cargo', mount: 'light', effects: [{ stat: 'capacity', kind: 'flat', value: 10 }]}),
    pct50   : part({ family: 'cargo', mount: 'light', effects: [{ stat: 'capacity', kind: 'percent', value: 0.5 }]}),
    gated   : part({ family: 'cargo', mount: 'light', requires: [{ rate: 'clear', rank: 1 }]}),
    grants  : part({ family: 'cargo', mount: 'light', provides: [{ rate: 'clear', rank: 1 }]}),
    hostile : part({ family: 'cargo', mount: 'light', conflicts: [{ rate: 'clear' }]}),
    multiFail: part({ family: 'cargo', mount: 'light', power: 50, requires: [{ rate: 'clear', rank: 1 }]}),
}

function part({ family, mount, power = 0, context = 'port', requires = [], conflicts = [], provides = [], effects = []}) {
    return { family, mount, power, context, requires, conflicts, provides, effects }
}

test('a module must match the slots family', () => {
    const f = new Fitting(toyCatalog)
    const { errors } = f.previewRig(toyHull(), {}, { type: 'install', slot: 'small', gid: 'wrongFam' }, { docked: true })
    assert.ok(errors.some(e => e.includes('does not fit')))
})

test('a module cannot exceed its slots mount size, but fits a bigger slot', () => {
    const f = new Fitting(toyCatalog)

    const overflow = f.previewRig(toyHull(), {}, { type: 'install', slot: 'small', gid: 'tooBig' }, { docked: true })
    assert.ok(overflow.errors.some(e => e.includes('too large')))

    const fits = f.previewRig(toyHull(), {}, { type: 'install', slot: 'big', gid: 'fits' }, { docked: true })
    assert.deepEqual(fits.errors, [])
})

test('a port-only module needs the ship docked, a field module never cares', () => {
    const f = new Fitting(toyCatalog)

    const transit = f.previewRig(toyHull(), {}, { type: 'install', slot: 'small', gid: 'fits' }, { docked: false })
    assert.ok(transit.errors.some(e => e.includes('port')))

    const inTransit = f.previewRig(toyHull(), {}, { type: 'install', slot: 'small', gid: 'inField' }, { docked: false })
    assert.deepEqual(inTransit.errors, [])
})

test('a module cannot draw more power than is available', () => {
    const f = new Fitting(toyCatalog)
    const { errors } = f.previewRig(toyHull(), {}, { type: 'install', slot: 'small', gid: 'hungry' }, { docked: true })
    assert.ok(errors.some(e => e.includes('power')))
})

test('a requirement checks the proposed rig, satisfied by any fitted module', () => {
    const f = new Fitting(toyCatalog)

    const missing = f.previewRig(toyHull(), {}, { type: 'install', slot: 'small', gid: 'gated' }, { docked: true })
    assert.ok(missing.errors.some(e => e.includes('clear')))

    const satisfied = f.previewRig(toyHull(), { big: 'grants' }, { type: 'install', slot: 'small', gid: 'gated' }, { docked: true })
    assert.deepEqual(satisfied.errors, [])
})

test('a conflicting rate blocks fitting', () => {
    const f = new Fitting(toyCatalog)
    const { errors } = f.previewRig(toyHull(), { big: 'grants' }, { type: 'install', slot: 'small', gid: 'hostile' }, { docked: true })
    assert.ok(errors.some(e => e.includes('conflicts')))
})

test('one operation reports every violation at once, not just the first', () => {
    const f = new Fitting(toyCatalog)
    // wrong family, unmet requirement and over budget, all together
    const { errors } = f.previewRig(toyHull(), {}, { type: 'install', slot: 'plug', gid: 'multiFail' }, { docked: true })
    assert.ok(errors.length >= 3, `expected several reasons, got ${ errors.length }: ${ errors }`)
})

test('capacity resolves flat, then percent, then the hull cap - in that order', () => {
    const f = new Fitting(toyCatalog)

    const loose = f.deriveStats(toyHull({ capacity_base: 10 }), { small: 'flat10', big: 'pct50' })
    assert.equal(loose.capacity, 30, '(10 + 10) * 1.5 - flat before percent, not the reverse (25)')

    const capped = f.deriveStats(toyHull({ capacity_base: 10, capacity_max: 20 }), { small: 'flat10', big: 'pct50' })
    assert.equal(capped.capacity, 20, 'the hull cap wins over the resolved 30')
})

test('derived stats do not depend on fitted-module input order', () => {
    const f = new Fitting(toyCatalog)
    const hull = toyHull({ capacity_base: 10 })

    const ab = f.deriveStats(hull, { small: 'flat10', big: 'pct50' })
    const ba = f.deriveStats(hull, { big: 'pct50', small: 'flat10' })
    assert.deepEqual(ab, ba)
})

test('cargoLoad weighs quantity by each goods volume', () => {
    const catalog = { ore: { volume: 1 }, 'reactor.mk1': { volume: 4 }}
    const load = cargoLoad([{ gid: 'ore', quantity: 3 }, { gid: 'reactor.mk1', quantity: 2 }], catalog)
    assert.equal(load, 3 * 1 + 2 * 4)
})

test('cargoLoad defaults an unlisted goods volume to 1', () => {
    assert.equal(cargoLoad([{ gid: 'mystery', quantity: 5 }], {}), 5)
})
