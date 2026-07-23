🚀 The Game
================

interstellar arbitrage under time delay.

a player buys goods at one station, sends a ship through relativistic transit,
and sells somewhere else. the game is a moving ledger of delayed economic facts -
which is exactly why kafka and event sourcing feel necessary rather than decorative.

core idea: [The Theory of Interstellar Trade](The.Theory.of.Interstellar.Trade.pdf)
(Krugman, 1978) - see the [summary](The.Theory.of.Interstellar.Trade.md).


### core loop

1. register → starter ship (`far treasure`) + wallet (1000 credits)
2. check market prices at the station
3. buy cargo
4. travel - ship departs, waits out relativistic transit, arrives
5. sell cargo at the destination
6. profit? only if the price gap beats the capital cost of travel time

**profit depends on:**
- purchase price / sale price
- distance and ship velocity
- common-frame travel time
- capital cost of goods in transit - `capitalCost(principal, rate, years_abs)`

ship-frame time is flavor for the ui.
profit math uses common-frame time - that is the Krugman lesson:
opportunity cost accrues in the frame of the
trading planets, not in the cargo's private little chronicle.


### travel math

```
years_abs = distance_ly / velocity          common-frame years
years_rel = years_abs * sqrt(1 - v²)        ship-frame (proper) time
game_s    = years_abs * TIME_SCALE          real seconds at the keyboard
cost      = principal * (1 + rate)^years_abs
```

### constants

owned by `@theseus/domain` (`packages/domain/src/universe.js`), each `readEnv`-backed with
the default shown - single source of truth, no service re-reads these itself:

```js
const TIME_SCALE      = 20      // 1 common-frame year = 20 game seconds
const INTEREST_RATE   = 0.05    // per common-frame year
const STARTER_CREDITS = 1000

const STARTER_SHIP = {
    name    : 'far treasure',
    stid    : 'sol.outpost',
    velocity: 0.6,              // fraction of c
    capacity: 20,
}
```

### the known universe (phase 1)

```
              4.3 ly
  sol.outpost ────── alpha.exchange
      │ ore ↑           │ grain ↑
      │ grain ↓         │ spice ↓
      │                 │
      │                 │      │
      │ 6.0 ly          │ 5.9 ly
      └───── barnards.port ────┘
              spice ↑  ore ↓
```

produce/consume triangle - every station exports one good cheap (`↑ produces`)
and craves another (`↓ consumes`), so profitable routes exist in every direction.
lives in code: [`@theseus/domain` universe.js](../packages/domain/readme.md).

goods: `ore` / `grain` / `spice` - each with `price_base` and `elasticity`;
prices float on supply & demand (`price(base, stock, target, elasticity)`),
stations quote a spread - ask above bid. no fixed state prices,
no commie game here.

routes at 0.6c: sol ↔ alpha `143s`, alpha ↔ barnards `197s`, sol ↔ barnards `200s`.


### phase 1 scope

**in**: register, starter ship, travel, station markets, buy/sell, live updates.

**out** (resist the scope goblin): combat, mining, refining, factories,
player-to-player markets, ship upgrades, npc fleets, complex auth,
multiple currencies.

steps + status live in [phase.1.md](phase.1.md), current work in [progress.md](progress.md).


ideas - phase 2+
--------------------------------

### solar sistem
shorter routes, much more populated.
every saturn/jupiter moon big enough needs a station

- neptun/uranus - big ports, starting point for interstellar travel
- mars - major hub
- ganimed - major hub
- titan - major hub
- mercury - ore mining
- venus - bio tech / research

### consume/produce
station can consume/produce more then one good,
not only goods, but also services like:
- repair
- security/policing
- tech
- work force
- etc..., needs more thinking.

### station types
- trade post
- research lab
- military base
- population center
- prison barge
- agriculture
- etc...

### more economy
- price drift over time - markets breathe even without players
- station stock regenerates from `produces`, drains from `consumes`
- interest rate as a game lever (raise it → long routes stop paying)

### universe growth
- `Universe.path(from, to)` - dijkstra multi-hop routing once the map
  outgrows the fully-connected triangle
- travel timer persistence - in-process `setTimeout` doesn't survive
  restarts; postgres as durable schedule or redis
