phase 3 - close the open threads, add depth
================================================

phase 1 (done, see [phase.1.md](phase.1.md)) built one player's loop.
phase 2 (done, see [phase.2.md](phase.2.md)) deepened it - a real
universe, roles and visibility, ship traffic, dijkstra routing and
travel manifests. what's left behind both is a large, unsorted backlog:
`game.md`'s ideas, `tech.debt.md`, `permissions.md`'s "what stays open",
and `client.md`'s TODO/accepted-risks/bugs lists. phase 3 curates a
scoped slice of it - close what previous phases explicitly left open,
add the depth that's actually within reach, defer what needs more
thinking or a bigger commitment first.

the eve-online research spike ([eve.md](eve.md)) is done - its
architecture notes (time dilation, single-shard economy) stay reference
material, not scheduled work.


steps
------------------------------------------------

phase-scoped numbering (3.1-3.7), not a continuation of phase 2's.
order follows priority, not file size: the name generator and tech-debt
sweep open small and easy, ship upgrades, the player messenger and ΔV
mechanics carry this phase's real player-facing depth, universe growth -
more content on an already-proven pattern - closes it out last, being
the least urgent of the seven. some steps share files (3.4, 3.6 and 3.7
all touch `packages/domain`; 3.3, 3.4, 3.5 and 3.6 all touch the client)
- none of that forces an order.

| step | what                                                             | status      |
|------|-------------------------------------------------------------------|-------------|
| 3.1  | ships name generator                                               | done ✔      |
| 3.2  | tech debt sweep                                                    | not started |
| 3.3  | travel manifest visualization                                      | not started |
| 3.4  | ship upgrades - capacity and velocity                              | not started |
| 3.5  | player messenger - the ansible                                     | not started |
| 3.6  | ΔV mechanics - in-system travel                                    | not started |
| 3.7  | universe growth - more stations, path() perf                       | not started |


### step 3.1 - ships name generator

was a dangling, unscheduled idea at the bottom of `phase.2.md` ("step
2.5", never added to that table). every new ship gets a random name
instead of the one fixed `starterShip.name = 'far treasure'`
(`packages/domain/src/universe.js`).

source data is already staged: `.dacrap/culture-*.csv` - Iain M. Banks'
Culture-series ship names, real data, not invented for this. promote the
relevant column into the repo proper, same move `docs/hygdata_v42.csv`
already made for star distances. add a `randomShipName()` export to
`packages/domain`, call it from `apps/ship-service/src/handlers.js`'s
`playerCreated` saga in place of the hardcoded name. renaming after
creation is already done ✔ (phase 1) - this only changes the starting
name.

**done ✔, built wider than the open call above.** the game will need
names at npc scale later, not only one starter ship per player - a
fixed ~160-name list repeats fast at that volume. `randomShipName()`
(`packages/domain/src/shipNames.js`) picks from 3 generators each call:
the curated Culture list, or one of 2 word-pool templates (adjective +
noun + a punny tail), giving tens of thousands of combinations. npc
fleets themselves stay out of scope - `game.md`'s own phase-1 call, not
reopened here.

side effect, fixed alongside: the client had a "name your ship" nudge
that only made sense when every ship started with the same fixed
placeholder name. dropped - `client/js/render.js`, `events.js`,
`session.js`, `state.js`, `api.js`. a rename is still one click away,
just not forced on first login.


### step 3.2 - tech debt sweep

small, independent fixes, bundled because each is too small for its own
step:

- **make file**

- ✔ **service uptime** - `scripts/services-check.js` now reads
  `.logs/<name>.pid` (the same file `start.sh`/`stop.sh` already use),
  and reports up/down, pid, and real uptime per service, next to the
  existing role/owns metadata. exits 1 if anything is down.

- ✔ **`NODE_ENV=dev|prod|test`** - `.env.dev` sets `NODE_ENV=test`,
  which reaches gateway via `main.js` → `createRoutes({ nodeEnv })`;
  the per-request log line skips itself in test. `garage/compose`
  already reads `NODE_ENV` on its own - `test` falls into the same
  branch as `dev` there, which is the wanted behavior, not a gap.

- ✔ **cargo hydrate bug** - `apps/gateway/src/queries.js`'s
  `cargo()` query now filters `AND c.quantity > 0`, matching what the
  live socket path already did (`mutateCargo()` in `client/js/events.js`
  splices a zero-quantity row out). a fresh page load can no longer show
  a "0 ore" line the live path would have hidden.

- ✔ **fix poll calls**, remove redundant function wrappers and fix types

- ✔ **sql code style uppercase** - unify sql code style, make all
  uppercase and aligned, `apps/gateway/src/queries.js`'s style.

  the blocker went first: tests no longer mock by matching sql text at
  all, so the reformat could no longer break one silently.
  `packages/testing/src/mocks.js` gained 2 routing modes - `fakeClient`/
  `fakePool` answer by call order (a queue, not a lookup); the shared,
  many-caller pools in `test/gateway.spec.js` route by the sorted set of
  tables a query touches, parsed from the query itself. neither ever
  matches on sql wording. every unit test file (`db`, `gateway`,
  `market`, `player`, `ship`) converted.

  then the reformat itself: every raw sql string in `apps/market-service`,
  `apps/player-service`, `apps/projection-service`, `apps/ship-service`,
  `packages/db`, and `packages/service` now uppercases keywords and
  right-aligns them, same as `queries.js`. migration `.sql` files stay as
  they are - out of scope, a separate, larger surface.

- ✔ **fetch - Sync** in tests: replace fetch, post calls with `garage/sync`

- **confirm dialog before travel** (`client.md` bugs list) - a misclick
  shouldn't commit a ship to a trip, more so now a click can mean
  several hops

- **pending-command timeout** (`client.md` accepted risks) - a lost
  command leaves a `…` feed line forever; a client-side timeout marks it
  failed instead

- **`using`/`Symbol.dispose`** for db client acquisition in
  `packages/db` (`tech.debt.md` "nice to have")

(already fixed alongside this doc, not gated on this step: the stale
travel-manifests TODO in `packages/domain/readme.md`.)


### step 3.3 - travel manifest visualization

closes the client-facing half of phase 2.4. ship-service resolves and
drives a manifest already; nothing shows it. `client.md`'s own old
header mockup already sketches the target:
`hops: mars → 2d → sol → 3y → alpha`.

the manifest doesn't reach the client today - `ship.departed.v1`/
`ship.arrived.v1` payloads don't carry it, a deliberate call made
building 2.4 to keep the event shape unchanged. **open call at step
start**: expose `manifest` on `GET /ships` only (cheap, hydrate-time,
matches how the rest of `state.ship` already works) vs also putting it
on the ws events (live-updates as hops advance, more wire surface).
recommend REST-only - a manifest shortens once every few seconds at
most, a re-hydrate on every `ship.arrived.v1` is enough.

touches `apps/gateway/src/queries.js` (`ships()`), `client/js/state.js`/
`events.js` (carry `manifest` through), and a small ship-detail panel in
`client/js/render.js`/`index.html`, styled after the existing mockup.


### step 3.4 - ship upgrades: capacity and velocity

`game.md`'s "ship types & upgrades" idea, narrowed to the 2 numeric
stats - ship classes (freighter/military/exploration/privateer/etc.)
stay out, see below.

**open call at step start**, same shape 2.4's manifest-storage call had:
the upgrade cost curve. nothing to reuse - `capitalCost()` prices
time-in-transit, not a one-time stat purchase. recommend linear-per-point
with a rising step; pin the actual numbers once this is scoped for real,
not in this doc.

new command/event pair (`ship.upgrade.requested` → `ship.upgraded` /
`ship.upgrade.rejected`), matching the market buy/sell saga shape
(`apps/market-service/src/handlers.js`): debit the wallet, then raise
capacity/velocity, same transaction shape `shipRenameRequested` already
uses. touches `packages/contracts`, `apps/ship-service`, a wallet debit
call (cross-service, same shape the market buy saga already uses), and
client upgrade UI.

**worth knowing going in**: a velocity upgrade only pays off on
interstellar legs. `travel()` already flies every in-system route at
`min(velocity, c)`, and in-system `c` (`SUBLIGHT`, 24 km/s) sits so far
below any ship's `velocity` in fraction-of-light-speed terms that the
cap always wins - a ship's own speed is already irrelevant in-system
today. step 3.6 is what finally gives an in-system stat something to
upgrade toward.


### step 3.5 - player messenger, the ansible

`game.md`'s "player 2 player communications" idea: "some kind of
ansible device that enables faster than light speed coms. but still
with delay, no instant/immediate message transfer." ship traffic and
per-station presence already went public in step 2.3
(`client/js/traffic.js`'s `dockedAt()`) - this is the messaging half of
that same idea, deliberately dropped from that step at the time.

**scope, decided at step start**: 2 message kinds, not 1.

- **station chat** - instant, public to every player currently docked at
  the same station. cheap: the presence data already exists
  (`dockedAt()`), this only needs a message log and a ws broadcast
  scoped to that station's currently-docked sockets.
- **ansible direct message** - private, player-to-player, delayed by
  distance. not instant - that's the whole point of the idea. the delay
  reuses the domain's existing distance math, at a new, much
  faster-than-any-ship `ANSIBLE_SPEED` constant (env-backed, alongside
  `TIME_SCALE`/`SUBLIGHT` in `packages/domain/src/universe.js`) - fast
  enough to be useful, slow enough that a cross-system reply is never in
  the same breath as the message. 0 delay when sender and recipient are
  docked at the same station.

**delivery is a poll, not a timer** - the same shape `arrivals.js`
already proved, `arrives`/`arrived` and all: `message.send.requested`
writes a row with a computed `deliver` (the scheduled instant, same
role `arrives` plays on `ships`); `poll()` (`@theseus/util`, the same
primitive `pollArrivals`/`pollOutbox` already use) claims rows where
`deliver <= now()` and sets `delivered` (nullable until then, same role
`arrived` plays), emitting `message.delivered.v1`. no new delivery
mechanism to invent, just the ships one applied to messages.

**new service**: `apps/comms-service`, its own pg schema (`comms`),
matching how ship-service/market-service each own one thing. `messages`
table: `mid, from, to (null for station chat), stid (station chat
only), body, sent, deliver, delivered` - `from`/`to` bare, no
underscores, the same compound-id move phase 1's own naming reference
already makes for `from_station → from` / `to_station → to` on ships,
just applied to player ids here instead of station ids. commands/events:
`message.send.requested` → `message.sent` (queued) / `message.delivered`
(poll-driven) / `message.send.rejected` (e.g. unknown recipient).

**privacy, per `permissions.md`'s own model**: a direct message reaches
only its 2 participants - the same owner-only ws routing `feed.js`
already does for private ship/wallet events. station chat is public to
players at that station, the same allowlist shape already used for
market/ship broadcasts.

touches: new `apps/comms-service` (handlers, migrations, a poll),
`packages/contracts` (new command/events), `apps/gateway` (routes + feed
routing), `client/js` (a messages panel - already sketched, never built,
in `client.md`'s old layout mockup).


### step 3.6 - ΔV mechanics, in-system travel

`game.md`'s own reading list points straight at this: a brachistochrone
trajectory - constant thrust to the midpoint, flip, constant thrust to
stop - "how fast could you travel between planets with continuous
acceleration and deceleration? (expanse-like)". replaces the flat
`SUBLIGHT` speed cap in-system rides on today
(`packages/domain/src/universe.js`) with something closer to how ships
actually fly in that setting.

**scope, decided by what already exists**: interstellar routes (`c=1`
links between stars) keep today's constant-velocity relativistic model
as-is - it's Krugman's own paper's own simplification ("ships travel at
constant velocity v < c... no acceleration phases",
[The.Theory.of.Interstellar.Trade.md](The.Theory.of.Interstellar.Trade.md)),
and a real relativistic-rocket version of this would be a much bigger,
separate physics problem. ΔV applies to in-system travel only, where the
accelerations involved are small enough for plain Newtonian mechanics
and the numbers stay game-sized (seconds to minutes, not years).

**the model**: symmetric brachistochrone, `t = 2 · √(d / a)`, `a` a
ship's own acceleration stat (new field, needs an AU/s² - or a
converted m/s² - unit decision at step start; today's distances are in
AU). replaces `SUBLIGHT`'s flat cap the way `c` already caps an
interstellar leg - a route can still set an upper bound a ship can't
out-accelerate. `apps/ship-service/src/travel.js` branches on route type:
`c < 1` → brachistochrone using `acceleration`, `c === 1` → today's
formula, untouched.

**left out of this step, on purpose**: player-controlled burns (choosing
accelerate/coast/decelerate, fuel mass, cargo weight affecting thrust) -
`game.md`'s fuller vision ("let player decide about acceleration/burn
duration/fuel mass"). this step ships the physics model with a fixed
per-ship acceleration stat; a tunable-burn, `fuel`-and-cargo-`weight`
economy is a distinct, later idea (see "explicitly out" - orbital
mechanics) since it changes the game's controls, not only its math.

touches `apps/ship-service/src/travel.js` (the branch),
`packages/domain/src/universe.js` (the `acceleration` stat, unit
helpers), a new `apps/ship-service` migration, and client eta previews
(`client/js/map.js`'s `routeInfo()`).


### step 3.7 - universe growth, more stations

only Sol is built out (`client.md` TODO, `packages/domain/readme.md`
TODO). Alpha Centauri, Barnards Star, Wolf 359 and Sirius hold one
station each. add 2-3 more per system, same pattern as Sol's build-out
(`docs/progress.md`'s "universe growth - the stations" writeup): real
orbital-radius data, produces/consumes pairs, `SUBLIGHT` in-system links
to that system's own gateway station (or the new ΔV model from 3.6, if
that's landed by then).

also closes the perf debt this growth motivates: `path()` is a linear
scan for the closest unvisited station, O(V²) per call - fine at a few
dozen stations, wrong at 10x this size (noted in `docs/progress.md` and
`packages/domain/readme.md`). swap it for a binary heap.

touches `packages/domain/src/universe.js` only - `client/js/map.js`
already lays stations out from count, not hardcoded positions (true
since Sol's own build-out).


explicitly out (phase 4+, someday, or standalone)
------------------------------------------------

from `permissions.md`: the **transponder switch** and **public trade
feed** - both fully designed there already, deliberately not picked up
this phase. **player-to-player trading** stays a distinct idea from the
messenger step - not scheduled even in `permissions.md`, and messaging
between players is not trading with them. admin mutating ops (credit a
wallet, restock a station - `permissions.md`'s own words: "wait for a
later phase"), a net-worth leaderboard.

from `game.md`: ship classes/types (freighter, military, exploration,
privateer, repair, passenger, prison barge), orbital mechanics +
interactive system maps + player-controlled burns (KSP-style piloting -
the fuller version of step 3.6's physics, with fuel mass and player
control, not just the trajectory model), multi-good station
consume/produce + non-good services (repair/security/tech/workforce),
station types beyond visibility (research lab, military base, prison
barge, agriculture), exploration/colonization/factions, port-operation
animations, a 3D client.

from `tech.debt.md`: dockerized deploy (needs a real plan first, not
scoped enough to schedule), a lit.dev-style frontend rewrite (the doc's
own call: could be a standalone repo, not necessarily part of theseus).

from `client.md`: the stickable/draggable/resizable panel layout
rework, `rs.file` cache headers (dev-only, stays noted not promoted -
same call phase 2 made).
