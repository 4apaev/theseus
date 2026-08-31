ship modules
================

mechanics design for phase 3 step 3.3. no implementation is implied by
the names used here; balance values remain deliberately unset.


premise
--------------------------------

a module is a physical piece of ship equipment. while packaged it is
cargo: it can be bought, carried to another station and sold. once
installed it becomes part of one ship's rig and changes what that
ship can do.

the system should create rig choices, not a staircase of permanent
stat purchases. a faster ship should have paid for that speed with
money, space, power, specialization or some combination of them. there
must not be one rig that is simply the previous rig plus every
number being larger.



the model
--------------------------------

four things which must stay distinct:

```
module design ──produces──> packaged module ──install──> fitted module
      │                                                   │
      └──── requirements and effects ─────────────────────┘

hull ── slots + rates + limits ──> legal rig ──> ship stats
```

- **module design** - the catalogue entry: family, mount, requirements,
  installation context and effects.

- **packaged module** - a tradable good in station stock or ship cargo.
  factory-standard modules of the same design are fungible and stackable.

- **fitted module** - one packaged module assigned to one slot on one
  ship. fitting removes it from cargo; removal returns the same design to
  cargo.

- **hull** - the immutable chassis: base stats, maximums, slots and
  built-in rates. modules change the rig, not the hull.

damage, wear, quality rolls and player modification would make individual
modules unique. those mechanics are deferred.



hulls and ship roles
--------------------------------

rules should test physical capabilities, not occupational labels. a
railgun does not fail because `class = trader`; it fails because the
hull has no weapon hardpoint of the right size, lacks power, or cannot
carry the required targeting system. a heavy tanker drive does not fit
a yacht because its propulsion mount is too large.

names such as courier, yacht, freighter and patrol ship remain useful to
players, but they describe hull profiles. they are not a parallel rules
engine.

a hull supplies:

- base cargo capacity
- base interstellar cruise velocity and a hard maximum velocity
- base in-system acceleration once the delta-v mechanic exists
- available power
- typed, sized module slots
- rates such as `light-frame`, `cargo-frame`,
  `military-hardpoint`, `passenger-rated` or `atmospheric`
- integrated essentials which cannot be removed if doing so would leave
  the ship unable to exist or travel

the full hull catalogue and buying new ships remain later work. phase 3
only needs a real hull profile for the existing starter ship, so the
module rules have something honest to validate against.

so a ship is combination of modules:
hull and drive are integrated essentials,
plus all the money can buy, minus requirements.



slots and budgets
--------------------------------

the initial slot families are:

| slot | purpose |
|------|---------|
| power | reactor and power-distribution equipment |
| cruise | interstellar propulsion |
| maneuver | in-system thrust and attitude control |
| cargo | holds, pods and cargo-support machinery |
| utility | comms, sensors, repair, science and other general systems |
| hardpoint | weapons and active defenses |
| external | docking gear, armor and signature-control surfaces |
| cosmetic | paint, art and other mechanically neutral changes |

mounts have sizes such as light, medium and heavy. a module must fit the
slot's family and size. this is the primary answer to "heavy tanker
engine in a yacht"; ad-hoc lists of forbidden ship names would become
unmaintainable.

phase 3 needs one shared budget in addition to slots: power. installed
modules are online automatically and their total draw may not exceed the
hull plus reactor supply. thermal load, structural mass and crew are
good later budgets, but adding them before they affect another playable
system would be numerology.



requirements and rates
--------------------------------

a module may require:

- a slot family and maximum mount size
- one or more hull or fitted-module rates, optionally at a
  minimum rank
- the absence of a conflicting rate
- enough power in the resulting rig
- an installation context: `field`, `port` or `dockyard`
- a station facility for specialist work; deferred until station
  services exist

modules provide rates as well as numeric effects. higher ranks
satisfy lower requirements. this makes dependencies composable: an
ansible may require `power: 2` and `comms-array: 1`; a railgun may require
`military-hardpoint: 2`, `power: 3` and `targeting: 2`.

requirements inspect the proposed final rig. they do not inspect
history. "the player once owned mark i" is not a physical property of
the ship.



progression is a graph, not one tree
--------------------------------

the ui may draw branches like a technology tree, but the underlying
mechanic is a dependency graph. real modules commonly need rates
from several families:

```
power ii ───────┬──> courier drive ii
                ├──> heavy cargo frame
targeting i ────┴──> railgun i <── military hardpoint
comms array i ─────> ansible transceiver
```

a literal linked list causes a replacement paradox: if drive ii requires
drive i to remain installed, both compete for the same drive slot. the
useful requirement is usually adequate power, mount, control hardware or
hull integration, not possession of the obsolete drive.

player knowledge, licenses and blueprints can form a separate unlock
tree later. they should not be smuggled into physical module fitting.
phase 3 uses geography and market supply for acquisition progression:
starter stations stock ordinary civilian equipment; specialist and
higher-grade modules must be found elsewhere. this belongs in an
interstellar trading game more naturally than an abstract experience
level.



acquisition and trade
--------------------------------

packaged modules use the station market like other goods:

1. a station produces or stocks selected module designs
2. the player buys one into ship cargo
3. it occupies cargo volume while packaged
4. the player may transport and resell it without ever being able to fit
   it to the current ship
5. installation moves it from cargo into a compatible slot

buying an incompatible module is allowed. otherwise players could not
trade equipment for other hulls. the market should warn "does not fit
current ship", never reject the purchase for that reason.

module markets are sparse. seeding every module at every station would
erase discovery, regional scarcity and most of the arbitrage. the same
supply-and-demand pricing model can price them, but availability follows
station production and specialization.

modules need packaged cargo volume. ultimately every cargo line needs
`quantity × volume`; treating a reactor and a crate of grain as the same
one capacity unit is tolerable only as an initial placeholder, not as
the final mechanic.



installation and removal
--------------------------------

installation is separate from purchase. therefore insufficient funds is
normally a purchase failure, not an installation failure. a later
dockyard service may charge labor and make funds relevant again.

installation contexts:

- `field` - may be fitted while docked or in transit; suitable for small
  comms, sensors, software-like controllers and cosmetics
- `port` - requires the ship to be docked; the phase 3 default
- `dockyard` - requires a suitable station facility; reserved for later
  hull, reactor and heavy structural work

phase 3 installation is immediate. timed refits, crew requirements and
repair queues can come later without changing the requirement model.

replacing one module with another is one atomic operation: validate the
final rig, remove the old module and fit the new one. this avoids a
ship having to pass through an impossible no-reactor or no-drive state.
the same validation removes the incoming package from cargo, returns the
outgoing package to cargo and checks the resulting load.

removal is rejected when the resulting rig would be illegal. common
cases:

- another fitted module would lose a required rate
- power draw would exceed the remaining supply
- removing a cargo module would leave the hold overloaded
- there is not enough resulting cargo space for the newly packaged
  module itself
- the module or current ship state forbids field removal

the capacity check uses the state after removal: remaining cargo plus
the packaged module must fit inside the reduced capacity.



effects and derived stats
--------------------------------

base hull stats never change. effective ship stats are derived from the
hull and current fitted modules, making removal reversible and preventing
permanent arithmetic drift.

numeric effects resolve in a fixed order:

1. hull base
2. flat additions
3. percentage modifiers
4. hull hard maximum

in compact form:

```
effective = min(hull maximum, (hull base + flat additions) ×
            (1 + sum of percentage modifiers))
```

negative additions and modifiers are allowed; they are how a module can
buy one advantage with another disadvantage without hidden exceptions.

rates use the highest provided rank unless a specific mechanic
says that sources stack. requirements and budgets are validated against
the complete proposed rig before any change takes effect.

speed modules are grades, not a button which may be pressed forever. one
primary cruise slot prevents unlimited multiplication. a grade may raise
effective velocity by roughly 5-10 percent over its predecessor, but the
hull maximum always wins and the actual values remain a balance decision.



two propulsion regimes
--------------------------------

`velocity` and the planned `acceleration` are not two names for engine
power:

- the **cruise drive** controls constant-velocity interstellar legs and
  is bounded by the hull's maximum fraction of c
- the **maneuver drive** controls in-system brachistochrone acceleration
  in phase 3 step 3.5
- the **reactor** supplies power to both and to the rest of the ship

keeping these separate permits a fast courier with poor local thrust, a
slow freighter with a powerful maneuver drive, or an expensive ship good
at both. a generic engine that simultaneously creates power, cruise
speed and acceleration would erase those choices.

the current starter ship already travels at `0.6c`. any proposed hull
maximum range around `0.5c-0.75c` must account for that baseline; setting
the starter hull's maximum too near `0.6c` would make its upgrade branch
mostly fictive.

propulsion and structural cargo modules are not field-installable.
therefore a mid-leg refit never changes an already scheduled arrival.
field modules whose effects concern comms, sensors or appearance may
take effect immediately.



module families
--------------------------------

| family       | possible effects                                    | useful when                     |
|--------------|-------------------------------------|---------------------------------|
| power        | supply, distribution, redundancy                    | other modules draw power        |
| cruise       | interstellar velocity, efficiency                   | interstellar travel             |
| maneuver     | acceleration and control                            | delta-v travel exists           |
| cargo        | capacity, secure/refrigerated/hazard holds          | cargo types need them           |
| handling     | load/unload rate, remote transfer                   | port operations take time       |
| comms        | range, ansible, encryption, relay                   | messaging exists                |
| sensors      | traffic range, passive scan, targeting              | detection has rules             |
| life support | safe duration, cold sleep, gravity, rescue capacity | crew survival matters           |
| docking      | collar size, ship-to-ship transfer, recovery        | ports differ                    |
| signature    | stealth, transponder masking, decoys                | detection can oppose it         |
| defense      | armor, point defense, countermeasures               | hazards or combat exist         |
| weapons      | railguns, missiles                                  | combat exists                   |
| industrial   | repair, salvage, mining, refining, science          | those activities exist          |
| habitation   | passengers, prisoners, crew comfort                 | people become cargo or actors   |
| cosmetic     | paint, vessel art, lighting                         | immediately; no numeric benefit |

do not ship a module before its effect has a playable consumer.
a loading rig while every trade is instantaneous is merely a noun wearing
a progress bar as a hat.



player-facing validation
--------------------------------

the fitting screen should preview the proposed rig and every changed
stat before confirmation. unmet requirements are visible there; rejected
commands should mostly represent stale state or races, not information
the ui concealed.

purchase failures:

- insufficient funds
- insufficient station stock
- insufficient cargo space
- price moved beyond the player's limit

fit or removal failures:

- module not carried by this ship
- incompatible or occupied slot
- missing or conflicting rate
- insufficient power
- ship is in the wrong state
- required facility unavailable
- resulting rig invalid
- resulting cargo exceeds capacity

one rejection may report all unmet requirements.
returning only the first makes a player repair
the same rig several times by attrition.



phase 3 playable slice
--------------------------------

step 3.3 should prove the loop without pretending to ship the final
catalogue:

1. starter ship gains hull profile, typed slots, base power and its
   present equipment as a legal starting rig
2. packaged modules as sparse, tradable market goods
3. install, remove and atomic replace operations
4. capacity and velocity derived from hull plus rig
5. small power branch, a cruise branch and a cargo branch
   with at least one meaningful incompatibility or trade-off
6. show fit, requirements, power and before/after stats in the client

step 3.4 can then make the ansible a comms module instead of a magical
account entitlement.
step 3.5 can add maneuver-drive modules and derive
acceleration through the same system.
those steps now depend on the module foundation
even though their gameplay remains separate.



explicitly deferred
--------------------------------

- exact prices, stat increments and hull maximums
- the full hull catalogue, buying ships and fleet management
- player certifications, research and blueprint unlock trees
- module manufacturing
- unique quality, wear, damage, repair and salvage state
- active/offline module power management
- heat, structural mass, fuel and crew budgets
- timed refits and dockyard labor prices
- station storage and player-to-player module sales
- insurance, contraband and military licenses






implementation
================

this plan implements only the phase 3 playable slice above. it builds a
generic foundation, but it does not implement every family listed in the
catalogue.


implementation decisions
--------------------------------

1. ### no module-service
  ship-service owns hull identity, fitted modules,
  rig validation and effective ship stats.
  market-service continues to own packaged cargo,
  station inventory and trades.

2. ### `goods` remains the tradable catalogue
  each good gains `kind` and `volume`;
  module designs reference a good id from that catalogue.
  this preserves the existing market, cargo and trade vocabulary.

3. ### fitting is a saga
  market-service and ship-service must not write
   each other's schemas. ship-service reserves a proposed rig,
   market-service atomically exchanges packaged cargo, then ship-service
   commits the fitted rig.

4. ### one pending refit per ship
  this is intentionally stricter than one per slot.
  dependencies, power and cargo capacity are ship-wide,
  so concurrent slot changes would create gratuitous races.

5. ### installing into an occupied slot means replace
  there is no third public command.
  install exchanges the incoming package for the fitted
  module already in that slot; remove only empties a slot.

6. ### `ship.created.v1` gains hull id and rig fields directly, no v2
  no player data exists yet at this stage of the project - infra gets
  wiped clean before this lands, so there is no old `ship.created.v1`
  row anywhere that needs a frozen legacy interpretation. versioning
  the event now would pay for a replay guarantee nothing yet needs.
  once real player ships exist, a later schema change earns its own
  `v2` the normal way - unchanged old rows, a new type for the new
  shape - this just isn't that day.

7. ### `capacity` and `velocity` stay on the ship row as cached effective values
  their source becomes hull plus rig,
  but keeping the columns avoids rewriting travel,
  routing and the market's ship mirror in the first pass.

8. ### the authoritative command reports all requirement failures
  a preview may be stale; the ship-service transaction remains the final judge.


ownership and data flow
--------------------------------

| concern | owner | mirrors / consumers |
|---------|-------|---------------------|
| hull and module catalogue | `packages/domain` | gateway and client |
| station module stock and prices | market-service | projection and client |
| packaged modules in cargo | market-service | projection and client |
| fitted modules and pending refits | ship-service | projection |
| effective capacity and velocity | ship-service | market-service and projection |
| requirement preview | shared domain resolver | gateway, client and ship-service |

the fitting flow is:

```
client
  │ ship.module.install.requested
  ▼
ship-service
  │ validate proposed rig + persist pending operation
  │ cargo.module.exchange.requested
  ▼
market-service
  │ lock ship cargo + exchange incoming/outgoing packages
  │ cargo.module.exchanged | cargo.module.exchange.rejected
  ▼
ship-service
  │ commit fitted modules + cached stats
  │ ship.rig.changed | ship.module.operation.rejected
  ▼
projection → gateway websocket → client
```

the pending operation is durable. a ship-service restart after the cargo
exchange does not lose the refit: the unhandled cargo event is retried,
finds the pending row and completes it. the consumer inbox is marked only
after the handler succeeds.


contracts
--------------------------------

add public commands on `commands.ship`:

- `ship.module.install.requested.v1` - `pid`, `sid`, `slot`, `gid`
- `ship.module.remove.requested.v1` - `pid`, `sid`, `slot`

install into an empty slot fits the package. install into an occupied
slot replaces its current module atomically.

add the internal command on `commands.cargo`:

- `cargo.module.exchange.requested.v1` - operation id, `pid`, `sid`,
  optional incoming-package gid, optional returning-package gid and the
  proposed effective capacity

extend `ship.created.v1`'s payload with hull id, rig version, every
fitted slot and effective stats - required fields, not optional; there
is no old-shaped row to stay compatible with.

add events:

- `cargo.module.exchanged.v1` - the operation id, cargo package removed,
  package returned, resulting load and proposed capacity
- `cargo.module.exchange.rejected.v1` - operation id and all reasons
- `ship.rig.changed.v1` - a private full snapshot: operation id,
  `pid`, `sid`, `hull_id`, monotonic rig version, changed slot,
  incoming/outgoing gids, every fitted slot, effective capacity and
  velocity, and power used/available
- `ship.module.operation.rejected.v1` - operation, `pid`, `sid` and all
  reasons

the full rig snapshot is deliberate. projection-service can replace
its fitted-module rows from one event, market-service gets the new
capacity without reimplementing module math, and the client can recover
from a missed intermediate render by rehydrating.

extend contract validators and declarations for arrays, optional gids,
slot ids, hull ids and rig versions. add contract tests before any
service consumes the new messages.

no new kafka topic family is needed. ship-service already consumes
`commands.ship` and adds `events.cargo`; market-service already consumes
`events.ship` and adds `commands.cargo`. projection-service already
consumes both event topics.


domain catalogue and resolver
--------------------------------

add a focused module under `packages/domain/src`, rather than expanding
`universe.js` indefinitely. it owns:

- immutable `hulls` and `modules` catalogues
- the starter hull id and its default fitted rig
- slot-family and mount-size ordering
- requirement and conflict evaluation
- rate rank collection
- power accounting
- effective-stat calculation
- a pure `previewRig(hull, fitted, operation, context)` result with
  proposed modules, stats and every unmet requirement
- pure weighted cargo-load and package-exchange preview helpers used by
  both market-service and the gateway preview

extend every entry in `goods` with:

- `kind: 'commodity' | 'module'`
- positive packaged `volume`, defaulting existing commodities to `1`

update the domain declarations for both fields; they are catalogue data,
not message-contract fields.

a module design contains its good id, family, mount, power draw,
installation context, requirements, provided rates and numeric
effects. it does not contain ownership, stock, price or fitted state.

export hulls, modules and the resolver from `packages/domain/src/index.js`
and update the public declarations and package readme. include the
catalogues in `universeData` so the gateway serves one immutable client
catalogue.

domain tests must cover:

- slot family and size compatibility
- ranked and conflicting rates
- power supply and draw
- flat then percentage effects, followed by the hull cap
- replacement of a module in the same slot
- multiple simultaneous failure reasons
- deterministic output regardless of fitted-module input order
- the starter rig resolving to today's effective capacity and
  velocity before any upgrade


ship-service persistence
--------------------------------

add the next ship migration:

- `ships.hull_id`, not null - no existing row to backfill
- `ships.rig_version`, starts at `1` on creation - no legacy `0` state
- `fitted_modules(sid, slot, gid, fitted_at, primary key (sid, slot))`
- `module_operations` with operation id, player, ship, slot,
  incoming/outgoing gids, proposed rig and derived stats, status,
  causation/correlation ids and timestamps
- a partial unique index allowing only one pending operation per ship

keep `ships.capacity` and `ships.velocity`; update both in the same
transaction that replaces the fitted-module rows. do not let handlers
increment those values directly.

new ships insert hull, version `1` and default modules in the existing
player-created transaction and emit the complete `ship.created.v1`
snapshot. no legacy boot-seeding path is needed - every ship that will
ever exist from this point on is created with a hull and a rig from
birth.


ship-service fitting saga
--------------------------------

the install/remove request handler:

1. locks the owned ship row and its fitted modules
2. rejects another pending refit
3. checks the requested module exists and is actually a module good
4. checks `field`, `port` or `dockyard` against ship state
5. runs the pure resolver against the proposed final slot contents
6. records every resolver error in one rejection event
7. stores the valid proposed snapshot as a pending operation
8. outboxes `cargo.module.exchange.requested.v1` with the original
   correlation id

travel must reject while a refit is pending. this closes the interval
between validating a port-only operation and receiving the cargo reply.
rename may remain allowed because it changes no rig condition.

the cargo-success continuation:

1. finds and locks the pending operation by operation id
2. replaces the fitted slot from the stored proposed snapshot
3. recomputes the snapshot with the current catalogue as a corruption
   check
4. updates cached ship stats and increments the rig version
5. marks the operation complete
6. emits `ship.rig.changed.v1`

the cargo-rejection continuation marks the operation rejected and emits
`ship.module.operation.rejected.v1` with the market reasons. duplicate or
late continuation events are no-ops once the operation is terminal.


market-service catalogue and cargo work
--------------------------------

change market seeding so existing commodities remain available at every
station, preserving the current loop, while a module market exists only
where that module gid appears in the station's `produces` or `consumes`
profile. drift already visits only those explicit profile entries, so it
needs no second availability model.

price calculation remains generic: module goods use the same base,
elasticity, stock and spread functions.

replace the quantity-only capacity calculation with volume-weighted
load:

```
load = sum(quantity × goods[gid].volume)
```

lock the market-service ship mirror row before every buy, sell, wallet
continuation or module exchange, then read all cargo rows and calculate
load from the immutable domain catalogue. capacity checks include volume
reserved by every pending buy for that ship. the common ship lock plus
pending reservations fixes the existing race where buys of different
goods can both pass before either wallet continuation loads its cargo.

add market migrations for:

- `ships.refit_id`, nullable, plus the mirrored rig version
- `cargo_module_operations`, keyed by the ship operation id, for durable
  exchange status and audit

market-service starts consuming `commands.cargo` and handles the exchange
command in one transaction:

1. lock the ship mirror and reject a different refit already in progress
2. reject while the ship has a pending market trade; otherwise a later
   wallet continuation could overfill the post-refit hold
3. lock the incoming and outgoing cargo rows
4. verify the incoming package exists
5. calculate the exact load after removing the incoming package and
   returning the outgoing one
6. reject when it exceeds the proposed capacity
7. apply both cargo changes, mark the ship refit id and persist the
   operation
8. emit one success or rejection event through the outbox

ordinary market buys and sells reject while `refit_id` is set.
`ship.rig.changed.v1` updates the mirrored effective capacity and
clears the matching refit id. it must not clear a different operation's
id or apply an older rig version.

buy capacity checks count both fitted cargo and pending-buy reservations.
settlement or compensation converts or releases that reservation in the
same transaction, under the same ship lock.

buying a module performs no compatibility check. only stock, funds,
price and weighted cargo capacity matter at purchase time.


projection and replay
--------------------------------

add projection migrations for:

- `ships.hull_id`, rig version, effective power used and available
- `fitted_modules(sid, slot, gid, primary key (sid, slot))`

no seed/backfill step is needed - `ship.created.v1` now always carries
a hull id and a rig, so the `ship.created.v1` handler projects them
straight from the event payload, for every row it will ever see.

the `ship.rig.changed.v1` handler replaces one ship's fitted rows and
updates its effective stats atomically only when its version is newer.
the cargo-exchanged handler applies the incoming/outgoing package deltas
to the cargo projection.

add `fitted_modules` to `scripts/rebuild.js`'s truncate set and extend the
projection rebuild integration snapshot. rebuilding an old history and a
new history must both reproduce the pre-rebuild state exactly.


gateway api and privacy
--------------------------------

extend owner-only reads:

- `get /ships` includes `hull_id`, effective power and the existing
  effective capacity/velocity
- `get /ships/:sid/modules` returns fitted slots after joining through
  the owned ship

add authenticated routes:

- `post /modules/preview` - loads the projection's hull, fitted modules
  and cargo, then runs the shared rig and package-exchange preview
  helpers without publishing a command
- `post /modules/install` - publishes the install command with `pid`
  taken only from the token
- `post /modules/remove` - publishes the remove command with `pid`
  taken only from the token

preview is advisory because projections may lag. install/remove command
validation remains authoritative and may still reject.

`ship.rig.changed.v1` and both rejection events stay owner/admin
only. do not add them to `feed.js`'s public ship allowlist; rigs,
power and module cargo are private.

`ship.created.v1` already has a public allowlist entry - new ships
remain visible traffic. its stranger-facing redaction needs to keep
omitting hull, modules, power, capacity and velocity now that the
payload carries them. owners and admins receive the full event.

update gateway query/route declarations, readmes and tests together.


client fitting flow
--------------------------------

extend hydration with fitted modules. hull and module definitions arrive
inside the existing universe catalogue.

the first client surface is one fitting panel based on the slot sketches
already in `client.md`:

- one row/card per hull slot, including empty slots
- fitted module, mount size, power draw and provided rates
- effective capacity, velocity, used power and available power
- compatible packaged modules carried in cargo
- explicit display of incompatible carried modules and every reason
- install, replace and remove actions

selecting an action calls the preview route and shows before/after stats,
cargo load and all failures. confirmation publishes the command through
the existing pending-correlation mechanism.

handle the new websocket events, including the extended `ship.created.v1`,
by rehydrating ship, cargo and fitted modules from their owner-only
endpoints. the event carries enough data
for an immediate patch, but rehydration is safer for this first slice and
keeps the client out of the business of replaying a distributed saga.

the existing market and cargo tables may render module goods without a
separate trading ui. use the catalogue name and kind; add a fit action
only on module cargo rows.


delivery sequence
--------------------------------

### 1. catalogue and pure rules

touch `packages/domain`, its declarations/readme and `test/domain.spec.js`.
finish with a starter hull and default rig that reproduce `20` cargo
capacity and `0.6c`, plus a minimal power, cruise and cargo module set.
these are compatibility fixtures, not final balance.

### 2. contracts

add the commands/events, trees, topics, validators and declarations in
`packages/contracts`; cover valid and invalid envelopes in
`test/contracts.spec.js`.

### 3. packaged-module economy

add good kind/volume, sparse module seeding, weighted cargo checks,
per-ship locking and module exchange handling in market-service. test
this independently before ship-service starts sending exchange commands.

### 4. ship persistence and saga

add hull/rig migrations, pending operations and install/remove
continuations. keep travel on cached effective velocity and block
travel during a pending refit.

### 5. projections and rebuild

project complete rig snapshots and cargo exchanges. update rebuild
before exposing any new read route; otherwise the new feature disappears
after an admin rebuild.

### 6. gateway and client

add owner-only reads, preview and command routes, then the fitting panel
and websocket rehydration. preserve the public feed allowlist.

### 7. end-to-end proof

exercise the actual player loop:

1. register and receive the starter rig
2. travel to a station stocking a module
3. buy it as cargo
4. install or replace it
5. observe cargo package removal and changed effective stats
6. travel and observe the new velocity affecting route time
7. remove the module, receive its package and sell it
8. rebuild projections and recover the same rig, cargo and stats


test matrix and gates
--------------------------------

focused tests:

- `test/domain.spec.js` - catalogue, requirements and stat resolution
- `test/contracts.spec.js` - every new payload and rejection shape
- `test/market.spec.js` - sparse stock, volume, exchange, locking and
  refit/trade exclusion
- `test/ship.spec.js` - validation, pending operation, continuation,
  restart-safe idempotency and travel exclusion
- a new projection unit spec - initial and replacement snapshots plus
  cargo exchange
- `test/gateway.spec.js` - ownership, preview, routes and websocket
  privacy

integration coverage:

- extend market integration for module purchase and weighted capacity
- extend ship integration for the cargo-exchange continuation
- extend game integration for buy → fit → faster travel → remove → sell
- extend projection rebuild integration with fitted modules

final gates:

```
git diff --check
npm run lint
npm run tsc
npm test
npm run test int
npm run smoke
```

the integration and smoke gates require postgres, kafka and local socket
binding. a restricted sandbox failure to bind is an environment failure,
not a reason to weaken or skip those tests outside it.


done when
--------------------------------

- old players and new players both have the same valid starter rig
- current trade/travel behavior is unchanged before fitting anything
- packaged modules are scarce station goods and can be traded by an
  incompatible ship
- install, replace and remove survive service restarts without losing or
  duplicating a package
- all requirement failures are visible before confirmation and returned
  authoritatively on rejection
- cargo can never exceed the resulting effective capacity
- a pending refit cannot race travel or a pending market trade
- effective velocity changes route timing but never changes an active leg
- module events and reads reveal no private rig to other players
- projection rebuild reproduces fitted modules, cargo and effective stats
- the full validation gates pass
