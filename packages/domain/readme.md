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
        - `link(a, b, ly, c)` - `c` is the speed limit of the route, in
          fractions of light speed. `1` lets the ship use its own velocity
        - `route(from, to)` → `{ ly, c }` / `distance(from, to)` → `ly` /
          `speedLimit(from, to)` → `c`
        - `node()` raises on an unknown system. every station lives in one,
          because the client map groups by it
        - `toJSON()` → `{ systems, stations, routes }` - plain wire shape,
          both directions of every link as its own row (gateway's
          `GET /universe`)
        - `path()` (dijkstra) still deferred - see the TODO below
    - `universe`    - the known universe singleton, 5 systems, 10 stations,
      15 links, 30 directed routes
    - `goods`       - `{ gid: { name, price_base, elasticity } }` - ore / grain / spice
    - `starterShip` - `far treasure`, docked `sol.outpost`, 0.6c, capacity 20
    - `TIME_SCALE` / `INTEREST_RATE` / `STARTER_CREDITS` - this game's tunable
      rules, `readEnv`-backed (defaults 20 / 0.05 / 1000) - single source of
      truth; ship-service and player-service import these instead of each
      reading their own env var with its own (driftable) default
    - `universeData` - `{ systems, stations, routes, goods, starter, constants }`
      - the full `GET /universe` wire payload, composed once at import time
- `src/economy.js` - supply & demand, no state prices here
    - `price(base, stock, target, elasticity)` - scarcity ↑, glut ↓
    - `spread(price, margin)` → `{ price_buy, price_sell }` - station ask above bid

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

**a straight line inside Sol is usually not a shortcut, but it can be.**
every in-system distance is `|radius_a - radius_b|`, so every station sits
on one line, at its own distance from Sol, in this order: Mercury, Venus,
Outpost, Mars, Ganymede, Titan. when a 3rd station sits between the 2 you
are comparing, a direct link costs exactly what the long way costs:
titan↔outpost (8.537 AU) equals titan→mars→outpost added up, since Mars
sits between them - and the same is true of mars↔titan against
mars→ganymede→titan. `path()` finds no shortcut on either pair. but
outpost↔mercury is a real shortcut (0.613 AU direct, 1.661 AU the long way
through Venus and Mars), because Outpost sits between Venus and Mars, not
beyond either one - so no 3rd station lies between Outpost and Mercury.
the stars are also not on one line, so `path()` has real work there too.

**star distances are real**, computed in light years from Sol against the HYG
star catalogue (`.dacrap/hygdata_v42.csv`), which ships in this repo.
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
line. the player flies one hop at a time until `path()` exists.

### the route speed limit

an in-system route caps the ship at `0.00008c`. this is 24 km/s, or 1.5 times
the speed of Voyager 2.

the cap keeps a short hop from ending before it starts. Venus to Mars at 0.6c
takes 0.0004 game seconds. at 24 km/s the same trip takes 3 seconds. Mars to
Titan, the longest hop in Sol, takes 32 seconds - still an order of magnitude
under a trip between stars.

time dilation follows the speed the ship really flies. a sublight hop ages the
pilot and the galaxy by the same amount. only a trip between stars costs the
pilot less time than the clock.


TODO
----------------
- **`Universe.path()`** - dijkstra multi-hop routing. the map has outgrown the
  fully-connected triangle, so this is now due. see [phase.2.md](../../docs/phase.2.md)
  step 2.4.
    - weight the edges by travel time, not by `ly`. an in-system hop is
      0.000013 ly and takes 3 game seconds. a hop between stars is 4.32 ly and
      takes 144. a shortest-distance path would route a player through the
      whole Sol system to save nothing.
    - inside Sol this changes nothing - every route between 2 stations
      already costs the same, since all of Sol's distances sit on one
      line (see above). the weighting only matters between the stars,
      where the real geometry is not a line.
- **more stations in the other systems**. only Sol is built out today.