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

**built ✔** - `sol.outpost` is the gateway, plus Mercury Deep, Venus Lab,
Mars Hub, Ganymede Yards and Titan Ring. an in-system route caps the ship
at 24 km/s, so a short hop still takes game time. see
[progress.md](progress.md). more moons stay an idea.

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

scheduled - see [phase.2.md](phase.2.md) step 2.1.

### universe growth
`Universe.path(from, to)` dijkstra routing - scheduled, see
[phase.2.md](phase.2.md) step 2.4. the stations are built. the routing is
not.


game balance
------------------------------------------------
theseus right now doesn't fell like a game, more like a simulation, (which is ok i guess).

in order to feel like a real game it need a good balance.
after most of the mechanics are implemented, the balance phase should be planed.


ideas
------------------------------------------------

the game is kinda boring right now.
it needs some cool elements for player experience.

### map of the universe

navigation as a map with ship travel animation.

1. player clicks on the destination
2. travel info shown
3. confirms travel
5. travel animation starts.
6. when waiting for travle to finish, display options:
    - at least a progress bar | spining logo | load animation
    - random quotes from SIFI books/tv/movies in meantime?
    - random events occurs, like pirates, good/bad aliens encounters?
    - accidents - meteorite strike, random engine problems
    - interest graph for cargo goods
    - station stock exchange graph
    - other ideas?

### port operations

cargo load / unload animations / repairs

### ΔV mechanics

[relativistic travel calculator](https://www.overvieweffekt.com/tools/relativistic-travel-calculator)

[brachistochrone rocket calculator](https://www.overvieweffekt.com/tools/brachistochrone-rocket-calculator) - how fast could you travel between planets with continuous acceleration and deceleration? ("expanse" like)


[3d interstellar-map playground](https://www.overvieweffekt.com/tools/interstellar-map)

[3d interstellar-map github](https://github.com/kevinsutjijadi/interstellarmap)

[astronexus](https://www.astronexus.com/projects/index)


add real ΔV calculus to the game.
let player decide about accelerate + blaming + mass of fuel and mass of the ship + cargo

1. introduce `cargo` `weight` field
2. introduce `fuel` entity with `mass`, `type`, etc...

let player decide about:
- acceleration / blaming,  duration / power
- fuel / mass calculation

**the brachistochrone trajectory model - scheduled**, see
[phase.3.md](phase.3.md) step 3.5, in-system travel only. the fuller
vision here - player-controlled burns, fuel mass, cargo weight - stays
an idea, not scheduled (see phase.3.md's "explicitly out").

### orbital mechanics

let player ability to mess with orbital mechanics (kerbal space program).
in other words give user ship control,
maybe even develop some piloting skills (RPG)

#### system map
for travels inside specific star system
show interactive map with orbits.
let user play with orbital mechanics, gravity assist (KSP style).

some time mechanics needed in flight. slow `TIME_SCALSE`
so user can react to ship maneuvers & adjust ship course

1. ship burn calcs + gravity
2. ship orbit changes as a result

consider real 3d view of the system ([three.js](https://threejs.org/editor/))
needs some thinking...


### stations

station can consume / produce more then one good.
not only goods, but also services
like repair, security / policing, tech, work force etc.

**station types**:
- trade posts
- research labs/outposts
- military bases
- population centers

### player 2 player communications & ship transponders

some kind of `ansible` device that enables faster then light speed coms.
but still with delay, no instant / immediate message transfer.
btw, player should be able to see other players at least in same station

- ship traffic visible, publishing travel manifests - done ✔, see
  [phase.2.md](phase.2.md) steps 2.3 and 2.4. switching off a ship's
  transponder stays open, see [permissions.md](permissions.md).
- the `ansible` device itself - scheduled, see [phase.3.md](phase.3.md)
  step 3.4
- player should be able to trade with other players - still an idea, not
  scheduled (phase 1 explicitly kept player-to-player markets out)

### ships name generator
every new ship gets a random name
[culture](https://en.wikipedia.org/wiki/Culture_series) style ship names
or like item nameing in diablo
or random words, up to 3,4 words for a name

**done ✔** - see [phase.3.md](phase.3.md) step 3.1. [progress.md](progress.md).


### crew

head hunt for best crew (nps)
pilots, engineers, etc...
each crew member should have traits.
crew effectiveness = member traits compatibility.


### weapons

missiles.
railguns.
mass drivers.
lasers only for short range if any.
a spiled bucket of bolts in ship route may be fatal.


### propulsion

light sail.
actual theseus (blindsight) telematter drive.


### ship types & modules

capacity and velocity changes now belong to a physical module and
loadout system, not permanent stat purchases. packaged modules are
market goods which can be bought, transported and resold; installation
checks hull slots, capabilities, power and whether the work may happen
in transit or requires port. the mechanics are designed in
[modules.md](modules.md) and scheduled as [phase 3](phase.3.md) step 3.3.

full ship classes and buying new hulls remain later work. phase 3 gives
the existing starter ship a hull profile so compatibility rules are
real rather than a collection of special-case ship names.

introduce ship classes / types / kinds

- freighter, tanker and other cargo ships
- research ship
- military, like: cruiser, frigate, corvette, etc
- exploration, research ship
- privateer, which suggests existents of states, empires and such. (somebody should give you a license to be a pirate after all)
- if there is a pirate, then - prison barge is a necessity
- repair ship
- passenger ship, a taxi, an interstellar uber). jokes aside, orbital taxi can be a thing

### exploration

give player the ability to establish new station/colony/base
form alliances and fractions
