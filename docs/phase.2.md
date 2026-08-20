phase 2 - deepen the core loop
================================================

phase 1 (steps 0-10, all done - see [phase.1.md](phase.1.md)) built one
player's loop: register, ship, travel, trade, live updates. `game.md`,
`tech.debt.md`, `permissions.md`, and `client.md`'s accepted-risks section
between them list a large, unsorted backlog - everything from price drift
to delta-v mechanics to a frontend rewrite. phase 2 optimizes for
**deepening what already exists**, not adding new subsystems - the same
"resist the scope goblin" discipline `game.md`'s phase-1-scope section
used, chosen over "everything on the table" and "tech-debt-first".

envelopes, naming reference, and the schema-per-service architecture in
[phase.1.md](phase.1.md) all still apply - not repeated here.


steps
------------------------------------------------

phase-scoped numbering (2.1-2.4), not a continuation of phase 1's 0-10 -
that table is closed. checked for file overlap: all 4 touch different
services except 2.2 and 2.3, which both lightly touch the gateway - none
of this needs to be sequential. order below is smallest/most isolated
first, not a dependency chain.

| step | what                                                          | status      |
|------|----------------------------------------------------------------|-------------|
| 2.1  | living economy - price drift, stock regen, interest rate lever | done ✔      |
| 2.2  | roles & visibility - `permissions.md`                          | done ✔      |
| 2.3  | player presence - ship traffic, transponders                   | not started |
| 2.4  | universe growth - dijkstra routing, travel manifests            | not started |


### step 2.1 - living economy

`station_inventory` already has `stock`/`target`
(`apps/market-service/migrations/002_station_inventory.sql`);
`packages/domain/src/universe.js` already tags `produces`/`consumes`
quantities per station. a periodic tick - same shape as `pollOutbox`
(`packages/db/src/outbox.js`) and `pollArrivals`
(`apps/ship-service/src/arrivals.js`) - nudges `stock` toward `target`
from `produces`, drains it from `consumes`, republishes
`market.price.changed.v1`. `INTEREST_RATE`'s "lever" framing (raise it,
long routes stop paying) only becomes meaningful once step 2.2 gives
something a way to change it live - the drift/regen half doesn't need
that, ships standalone. touches `apps/market-service/` only.

### step 2.2 - roles & visibility

design already fully written in [permissions.md](permissions.md) - read
that file when this step starts, don't re-derive it. `players.role`
column, JWT claim, `requireRole` middleware, 3 tiers (public / owner /
admin). **3 open questions block the build**, already named in that doc:
is handle/net-worth visible beyond the trade feed (decides if a
public-safe players view is needed), read-only-plus-rebuild or also
mutations for admin, and the admin bootstrap mechanism (env allowlist vs
a db flag) - resolve those first. unlocks real uses for step 10's
`event_log`, which currently has zero http exposure - `GET /admin/players`,
`GET /admin/events`, `GET /admin/inventory/:stid`, `POST /admin/rebuild`
(today `npm run rebuild`, a bare script). touches `apps/player-service/`
(role column), `apps/gateway/` (claims, middleware, routes), `client/`
(branch on `claims.role` - optional for this phase, a full admin ui can
slip to phase 3, the plumbing shouldn't).

### step 2.3 - player presence

`permissions.md` already decided this, not open: "ship traffic is public
by default... market transactions are public by default." no role
dependency - this is the public tier, not admin. new
`GET /station/:stid/ships` read route + a ws broadcast for other players'
ship movements, same pattern `apps/gateway/src/feed.js` already uses for
`market.price.changed` (broadcast to everyone vs routed by `payload.pid`).
client renders other ships on the map. transponder on/off (`game.md`'s
own words: "a future mechanic") - ship first with everyone always
visible, add the per-ship toggle later if it doesn't fit this pass;
don't let it block base visibility. touches `apps/gateway/` (route +
`feed.js`), `client/js/map.js`.

### step 2.4 - universe growth, light touch

`Universe.path(from, to)` - dijkstra multi-hop routing in
`packages/domain/src/universe.js`, plus just enough new stations (2-3)
to actually break the fully-connected-triangle assumption and exercise
it - not `game.md`'s full "every moon gets a station" solar-system
vision, that's phase 3+ content work, this step is only about the
routing code working. `client/js/map.js` already lays stations out from
station count, not hardcoded positions, so new stations should render
without client changes.

**routing, decided**: a route is a **travel manifest** - an ordered list
of stations (matches `game.md`'s own "publish travel manifests" idea
under step 2.3's p2p section; a manifest *is* a multi-hop route, the two
steps share one concept). the player builds one either of two ways:
click a sequence of map nodes by hand, or pick a final destination and
auto-fill the path with `Universe.path()`. either way it resolves to the
same manifest shape before departure. ship-service consumes one hop at a
time off the manifest (arrives at hop N → poll picks it up per the
existing `arrivals.js` mechanism → auto-departs hop N+1), rather than one
command that blindly chains every segment - keeps each leg a normal
`ship.departed`/`ship.arrived` pair, nothing new for the projection or
the client's existing per-arrival rendering to learn. exact manifest
storage shape (new column vs new table) is a step-2.4-start decision, not
this doc's.


explicitly out (phase 3+, someday, or standalone)
------------------------------------------------

from `game.md`: ship upgrades/classes (rename, capacity/velocity
upgrades, freighter/military/exploration/privateer/etc.), delta-v
mechanics, orbital mechanics + system maps, multi-good station
consume/produce + services (repair/security/tech), station types beyond
visibility, exploration/colonies/factions, port operation animations.

from `tech.debt.md`: dockerized deploy, the eve-online research spike, a
lit.dev-style frontend rewrite (the doc itself says it could be a
dedicated repo, not necessarily part of theseus). the smaller hygiene
items there (db helpers move to `@theseus/db`, the `handlers.js`
named-function refactor pattern, `NODE_ENV`) stay in `tech.debt.md` as
opportunistic work alongside phase 2's steps, not gating any of them.

from `client.md`'s accepted risks: no pending-command timeout, `rs.file`
sends no cache headers - stay noted there, not promoted.
