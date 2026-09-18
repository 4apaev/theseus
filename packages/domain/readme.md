🧮 domain
================================


- pure domain math + game data - no file/network io, no deps on other theseus
  service packages; the one exception is `@theseus/config`'s `readEnv`, used
  to read this game's tunable rule constants (see below)
- interstellar trade formulas from Krugman's [the theory of interstellar trade](../../docs/The.Theory.of.Interstellar.Trade.md)


### deps:
- `@theseus/config` - `readEnv` for the game-mechanics constants
- otherwise none (uses `garage/util` via the root workspace)


### exports
- `src/trade.js`
    - `commonFrameYears(distanceLy, velocityC)` - `distance / velocity`
    - `shipFrameYears(distanceLy, velocityC)`   - relativistic proper time, `years * sqrt(1 - v²)`
    - `gameSeconds(commonYears, secondsPerYear)` - game clock conversion
    - `capitalCost(principal, interestRate, commonYears)` - compound interest over travel time
- `src/universe.js`
    - `Universe` - two levels: `systems` (stars) hold `nodes` (stations),
      `edges` is the undirected adjacency between stations
        - `system(sysid, meta)` / `node(stid, meta)` / `has` / `neighbors`
        - `link(a, b, ly, c)` - `c` is the peak speed of the route, in
          fractions of light speed. `1` lets the ship use its own velocity
        - `route(from, to)` → `{ ly, c }` / `distance(from, to)` → `ly` /
          `speedLimit(from, to)` → `c`
        - `node()` raises on an unknown system. every station lives in one,
          because the client map groups by it
        - `toJSON()` → `{ systems, stations, routes }` - plain wire shape,
          both directions of every link as its own row (gateway's
          `GET /api/universe`)
        - `path(from, to, velocity, acceleration)` → ordered stids, `from`
          and `to` both included, or `undefined` when nothing connects them -
          dijkstra, weighted by `legTime()`, not by `ly` alone, so the
          winning route can change with the ship
        - `legTime(ly, c, velocity, acceleration)` → years for one leg.
          an interstellar route holds one speed. an in-system route
          accelerates, then decelerates - see "the 2 travel models" below
    - `universe`    - the known universe singleton, 5 systems, 10 stations,
      15 links, 30 directed routes
    - `goods`       - `{ gid: { name, price_base, elasticity, kind, volume } }` -
      ore / grain / spice (`kind: 'commodity'`) plus the packaged module
      goods from `modules.js` (`kind: 'module'`) - one catalogue for
      everything tradable, `kind` and `volume` drive cargo weighting
    - `starterShip` - docked `sol.outpost`, 0.6c, capacity 20 (name comes
      from `randomShipName()`, not a field on this object)
    - `randomShipName()` - a fresh ship name each call: some come from
      Iain M. Banks' Culture novels, the rest are generated from word
      pools, sci-fi flavored. `src/shipNames.js`.
    - `TIME_SCALE` / `INTEREST_RATE` / `STARTER_CREDITS` - this game's tunable
      rules, `readEnv`-backed (defaults 20 / 0.05 / 1000) - single source of
      truth; ship-service and player-service import these instead of each
      reading their own env var with its own (driftable) default
    - `universeData` - `{ systems, stations, routes, goods, hulls, modules, starter, constants }`
      - the full `GET /api/universe` wire payload, composed once at import time
- `src/economy.js` - supply & demand, no state prices here
    - `price(base, stock, target, elasticity)` - scarcity ↑, glut ↓
    - `spread(price, margin)` → `{ price_buy, price_sell }` - station ask above bid
- `src/modules.js` - ship modules catalogue + resolver. mechanics are
  designed in [docs/modules.md](../../docs/modules.md) - read that first.
  `Design` and `Hull` are real classes - a bad or missing field throws
  at construction, not on first use. jsdoc types alias
  `types/modules.d.ts` rather than redefine it, so the two can't drift.
    - `hulls` - `{ id: Hull }`, one entry today: `starter` (20 capacity,
      0.6c, matching the existing starter ship before any upgrade)
    - `modules` - `{ gid: Design }` - family, mount, power draw,
      install context, requirements/conflicts/provides (rate + rank)
      and effects (flat/percent). a design is not a good - see `goods`
      below, they join on a shared gid
    - `starterRig` - `{ slot: gid }`, the starter hull's day-1 fit
    - `mounts` / `slotFamilies` - ordering data for the client
    - `Fitting` - the resolver, bound to one module catalogue at
      construction (`modules` by default - tests pass their own toy
      catalogue instead)
        - `deriveStats(hull, fitted)` → `{ capacity, velocity, power: {
          available, used } }` - hull base → flat → percent → hull cap,
          the same fixed order for every stat
        - `previewRig(hull, fitted, operation, context)` → `{
          proposed, stats, errors }` - one install or remove, checked
          against the *proposed* final rig only, never history.
          `errors` lists every violation, not just the first
    - `fitting` - the live `Fitting` instance every service imports;
      `deriveStats` / `previewRig` above are it, already bound
    - `cargoLoad(cargo, goodsCatalog)` - `Σ(quantity × volume)`, so a
      reactor and a crate of grain are not the same 1 cargo unit
    - `previewExchange(load, goodsCatalog, { incoming, outgoing })` -
      the resulting load after one module exchange, either side
      optional. shared by market-service's real saga and the gateway's
      advisory preview - see `docs/modules.md`

------------------------------------------------

### the known universe

5 star systems, 10 stations, 15 links. one station in each system carries the
links to other stars - the gateway. Sol is the only system built out, and its
planets link only to each other.

**between the stars**, in light years:

```
  sirius.gate ───── 9.02 ───── wolf.reach        sirius : ore   ↑ spice ↓
      │  ╲                        ╱   │          wolf   : grain ↑ ore   ↓
      │    ╲                 10.93    │          barnard: spice ↑ ore   ↓
   9.52     ╲                ╱      8.27         alpha  : grain ↑ spice ↓
      │       ╲        barnards.port  │          sol    : ore   ↑ grain ↓
      │         ╲          ╱  ╲       │
      │           ╲    6.44   5.95    │
      │             ╲    ╱      ╲     │
      └───── alpha.exchange ─ 4.32 ─ sol.outpost
```

**inside Sol**, in AU. Mars is the junction. Sol Outpost sits at Earth's
orbit - home base, between Venus and Mars:

```
  mercury ─ 0.336 ─ venus       mars ─ 3.679 ─ ganymede
     │                  ╲       ╱  │                │
   0.613                0.524     8.013 ─┐        4.334
     │                    ╲     ╱         │          │
     └───────────────── outpost ── 8.537 ┴─────── titan
```

every station exports one good cheap (`↑ produces`) and craves another
(`↓ consumes`), so profitable routes exist in every direction. whether a run
profits after `capitalCost` of travel time - that's the game.

**a straight line inside Sol always wins on time, and sometimes on
distance too.** every in-system distance is `|radius_a - radius_b|`, so
every station sits on one line, at its own distance from Sol, in this
order: Mercury, Venus, Outpost, Mars, Ganymede, Titan. when a 3rd station
sits between the 2 you are comparing, a direct link covers exactly the
distance the long way covers: titan↔outpost (8.537 AU) equals
titan→mars→outpost added up, since Mars sits between them - and the same
is true of mars↔titan against mars→ganymede→titan.

equal distance is not equal time. a ship stops at every station on its
route, then accelerates again from rest. an in-system leg costs roughly
`2·√(d/a)`, and a square root is subadditive, so 2 legs always cost more
than 1 leg of the same total distance. `path()` takes the direct link on
both pairs.

outpost↔mercury is shorter as well as faster (0.613 AU direct, 1.661 AU
the long way through Venus and Mars), because Outpost sits between Venus
and Mars, not beyond either one - so no 3rd station lies between Outpost
and Mercury. the stars are also not on one line, so `path()` has real
work there too - `sol.mercury` to `sirius.gate` comes back
`sol.outpost → alpha.exchange → sirius.gate`, the 2-hop route, never the
3-hop one through Barnards Star and Wolf 359.

**star distances are real**, computed in light years from Sol against the HYG
star catalogue (`docs/hygdata_v42.csv`), which ships in this repo.
`alpha.exchange` stands for Rigil Kentaurus, the G2V star of the Alpha
Centauri pair.

**an in-system distance is the gap between two mean orbit radii**, in AU. the
radii are the standard published NASA figures. it is an approximation - the
true distance changes as the planets move around the star. Sol Outpost has
no orbit of its own - it sits at Earth's, 1.0 AU out, because it is home
base, where every new player starts. Ganymede and Titan are moons, so they
sit at their planet's orbit - Jupiter's and Saturn's.

**no gateway links to every other gateway.** Sol does not reach Wolf 359 or
Sirius directly. a player flies through Alpha Centauri, or through Barnards
Star. that restriction is a design choice, not a fact about the stars - Sol
really is 7.80 ly from Wolf 359 and 8.60 ly from Sirius, both a straight
line. `path()` picks the multi-hop route, so a player never has to plan the
detour by hand.

### the 2 travel models

`legTime(ly, c, velocity, acceleration)` holds both. the route's own `c`
picks between them.

**between stars, `c` is 1.** the ship holds its own velocity for the whole
leg, and the leg takes `ly / velocity`. this is Krugman's own
simplification - see
[The.Theory.of.Interstellar.Trade.md](../../docs/The.Theory.of.Interstellar.Trade.md).
the pilot ages less than the galaxy.

**inside a system, `c` is `0.00008`** - 24 km/s, or 1.5 times the speed of
Voyager 2. the ship accelerates to the midpoint, flips, then decelerates.
this is a brachistochrone trajectory. `a` comes from the hull and the
fitted maneuver drive.

the peak speed is `√(a·d)`. a leg that stays under `c` takes `2·√(d/a)`.
a leg that reaches `c` coasts between the 2 burns, and takes `d/c + c/a`.
the coast formula approaches `d/c` as `a` grows, so the old flat-speed
model is this same model with an unlimited drive.

the cap keeps a strong drive from ending a short hop at once. it also
holds every in-system speed far below light, so an in-system leg ages the
pilot and the galaxy by the same amount. only a trip between stars costs
the pilot less time than the clock.

the starter hull accelerates at `0.002` m/s². Venus to Mars then takes
about 10 game seconds, and Titan to Sol Outpost, the longest hop in Sol,
about 41. a `maneuver.mk2` drive raises `a` to `0.006`, which cuts the
short hop to about 6 seconds. the hull caps `a` at `0.01`. these are
balance numbers, not physics.


TODO
----------------
- **more stations in the other systems**. only Sol is built out today.
- **`path()` is O(V²) per call** - a linear scan for the closest unvisited
  station, no heap. fine for a few dozen stations, wrong for a universe
  10x this size.