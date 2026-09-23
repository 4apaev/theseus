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

**scheduled** - see [phase.4.md](phase.4.md) step 4.11. the sim measures
it, and an agent player gates it: the dice never haul cargo on purpose,
so every run today measures the dice and not the game.


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

### the gravity well

`legTime()` knows distance, speed and acceleration. it does not know
that a star pulls. so the inner system is the cheapest place on the
map today. Sol Outpost to a station at 0.05 AU is a 1.29 AU hop, which
is shorter than Mars to Ganymede. physically it is the most expensive
address in the game.

one term repairs this. effective acceleration becomes `a - GM/r²`.

solar gravity against the starter ship, which pushes 0.002 m/s²:

| orbit | solar g | against the starter |
|-------|---------|---------------------|
| 0.05 AU | 2.37 m/s² | 1185x |
| 0.2 AU | 0.148 | 74x |
| 0.387 AU, Mercury | 0.0396 | 20x |
| 1.336 AU, the Outpost | 0.0033 | 1.7x |
| 5.2 AU, Ganymede | 0.00022 | 0.1x |

the radius where the star pulls as hard as the ship pushes:

| acceleration | holds station down to |
|--------------|-----------------------|
| 0.002, starter | 1.72 AU |
| 0.006, with maneuver.mk2 | 0.99 AU |
| 0.02 | 0.54 AU |
| 0.10 | 0.24 AU |

so the starter ship cannot reach Mercury under its own thrust. it gets
there today only because the arithmetic ignores the well.

**what the term buys**: the inner system gates on the drive, not on the
wallet. a new maneuver tier opens a place, and not a number on a panel.
an Icarus station at 0.05 AU asks for about 2.4 m/s², which is 3 tiers
past anything the game ships. `path()` also gains a new answer - a leg
that is impossible for this ship, rather than merely slow. the
`no route to destination` rejection already carries it.

**the caution**: every in-system leg changes, because Sol's own
stations sit between 0.387 and 9.5 AU. Mercury and Venus turn hard for
a starter ship, and the early game moves to the outer system. that is
either the best part of the idea or a balance fault. the sim answers it
first - run the dice players with the term on, and read the rejection
mix.


### fuel

the fuller ΔV vision above wants fuel with mass. 4 shapes carry it, and
they are not the same feature. pick the payload first:

1. **range** - some places need a plan. only this one changes the map.
2. **a hold tradeoff** - carry cargo, or carry fuel.
3. **stranding** - a ship that cannot pay to leave. the most
   interesting state in the list, and a rage quit with no rescue rule.

| shape | what it costs to build |
|-------|------------------------|
| **a good** with `volume`, sold everywhere | almost nothing. cargo, trades, drift and capacity already carry it, and the market prices it by scarcity. it takes hold space, so payload 2 arrives free |
| **a ship stat** with a refuel command | its own price rule, its own panel, and it reuses nothing |
| **tiers** - reaction mass everywhere, antimatter from Icarus | this is the shape that makes Icarus matter. module tiers become a fuel unlock |
| **none** - the well and the clock are the cost | zero new parts |

**spend fuel per ΔV, not per distance.** an in-system leg is a
brachistochrone burn, and `legTime()` already computes it, so the ΔV
falls out. an interstellar leg holds one speed, so it costs one boost
and one brake. a climb out of a well costs the extra above.

the ships cruise at 0.6c. the true rocket equation at that speed asks
for a mass ratio in the thousands, so full fidelity breaks the setting.
**fuel as mass** - a full tank accelerates slower - closes the loop with
the well, and it also makes every route recursive, because `path()`
must then solve for the fuel it carries. leave it out of the first
version.


### fees and taxes

the game already charges a tax, and nobody named it. `spread(px, 0.1)`
sells to the player at +10% of spot, and buys from the player at -10%.
a round trip costs **22.2% of spot** before anything else.

so a trade pays only when the destination beats the origin by more than
22%. the price curve reaches that easily - a stock ratio of 1.5 gives
ore a 1.63x price. profitable arbitrage exists. the dice players never
found it, because they buy and sell at the same station.

**a flat fee is a number someone invents. a derived fee is a
consequence of the map.**

| fee | derived from | what it makes true |
|-----|--------------|--------------------|
| docking | orbit radius, `GM/r²` | a deep well port costs energy to hold. Icarus becomes the dearest dock, for a physical reason |
| handling | cargo volume moved | bulk ore costs more to shift than spice. `volume` sits on every good, and nothing prices it |
| sales tax | the station's produces or consumes map | a consumer station subsidises a good. a producer taxes the export |

all 3 read data that exists. none asks for a new number per station.

fees repair the Icarus price without a single change to `legTime()`.
the gravity well stays the better idea, because it gates on the ship
and not on the wallet. the 2 stack: hard to reach, and dear on arrival.

**the caution**: every sim run so far ends with the players in the red
and the stations ahead - station profit +1645 against players at -936.
fees deepen a hole that is already too deep. the report's
`player_profit` and `station_profit` are the same subtraction from both
sides, so they are the gauge.


### the order

1. the gravity well. one term, no new subsystem, and it gates the map.
2. an agent player that hauls cargo on purpose, so the real margin
   becomes measurable. see [sim.md](sim.md).
3. fees, set to what that margin carries.
4. fuel, only if the map still needs a reason to plan.


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


[fictional-but-realistic-spacecraft](https://www.secretprojects.co.uk/threads/fictional-but-realistic-spacecraft.10219/page-8)


[solar sail](https://www.nasa.gov/general/nasa-next-generation-solar-sail-boom-technology-ready-for-launch/)


#### telematter drive
[actual theseus](https://www.rifters.com/blindsight/theseus.htm).

requires a dedicated propulsion station!

is propelled by an line-of-sight (LOS) antimatter-teleportation drive.

🫢 math drive 🧮


technical concepts:

1. the power source: telematter beam unlike traditional sci-fi ships
  theseus carries almost no on-board fuel.

2. the icarus array: a massive, solar-powered antimatter manufacturing facility
  orbiting close to the sol produces the required antimatter.

3. quantum teleportation: instead of shooting a physical
  stream of fuel across space, the icarus array beams tight-focus
  quantum information to theseus.

4. on-board assembly: a receiver on the ship uses this stream of information
  to instantly transmute or "assemble" local, mundane matter stored in its tanks directly into antimatter particles, generating fuel on demand.

5. performance capabilities because it does not suffer from the logistical weight
  restrictions of carrying its own fuel, theseus operates on an entirely different scale of performance:

6. unlimited range: the ship has functionally unlimited range, provided it remains within the line-of-sight broadcast range of the icarus array.

7. extreme acceleration: it can handle a sustained burn of 3.2g and execute maneuvering burns up to 7.9g, giving it blistering speed for its deep-space intercept mission.


8. hull configuration & shieldingthe mechanics of this drive drastically dictate the ship's physical appearance and operations. the engine assembly is gargantuan compared to the living quarters. the powerful magnetic fields generated by its antimatter containment systems are actively repurposed as a shield, insulating the transhuman crew from harmful cosmic radiation during transit. additionally, a bussard ramjet mechanism is utilized to sweep up interstellar hydrogen to feed its manufacturing systems.




### ship types & modules

capacity and velocity changes now belong to a physical module and
rig system, not permanent stat purchases. packaged modules are
market goods which can be bought, transported and resold; installation
checks hull slots, rates, power and whether the work may happen
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

### notable sifi refs

- blindsight
- planetes (manga + tv series)
- Lem
- serenity
- cowboy bebop
- rama (Clarck)
- bobverse
- fire upon the deep
- keng ho


### ship's personal traits / characteristic

slightly randomize ship's traits
velocity, acceleration, etc


### repairs

wear comes from use, the ship wears with time.
player should invest in repairs, and care.

ships's characteristics decay with `wear`.

ship gains new trait - `wear`
degraids with time + combat damage