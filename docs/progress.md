theseus - progress
================================================

full step list
- phase 2 (current): [phase.2.md](phase.2.md)
- phase 1 (done): [phase.1.md](phase.1.md)
- game design: [game.md](game.md)
- roles design: [permissions.md](permissions.md)

------------------------------------------------
step 2.2: roles & visibility - done ✔
------------------------------------------------

design in [permissions.md](permissions.md) - all 3 open questions
resolved before the build started (handle-only public visibility,
read-only + rebuild admin surface, `ADMIN_HANDLES` bootstrap). role
plumbing follows the doc's own 4-item list exactly.

- [x] `apps/player-service/migrations/004_players_role.sql` - `players`
      gains `role text not null default 'player'`
- [x] `apps/player-service/src/handlers.js` - `loginPlayer` reads `role`,
      promotes to `'admin'` on an `ADMIN_HANDLES` match (never demotes -
      an env change alone can't strip an existing admin), `role` rides
      in `player.login.succeeded.v1`'s payload
- [x] `packages/contracts/src/schemas.js` - `playerLoginSucceeded` gains
      `role: field.has('player', 'admin')`, required
- [x] `apps/gateway/src/routes.js` - `/login` signs `role` into the JWT
      and returns it in the reply body; new `requireRole(role)`
      middleware; 4 admin routes, all gated:
      `GET /admin/players` `/admin/events` `/admin/inventory/:stid`,
      `POST /admin/rebuild`
- [x] `apps/gateway/src/queries.js` - `allPlayers()` / `eventLog()` /
      `inventory(stid)`. `inventory` reads `market.station_inventory`
      directly (schema-qualified) - the projection only mirrors quotes,
      not raw stock, and stock is the "source of truth" the doc calls for
- [x] `apps/gateway/src/main.js` - imports the existing `scripts/rebuild.js`
      (unchanged), injects it into `createRoutes` as `rebuild`, overridable
      via `opt.rebuild` for tests
- [x] `apps/gateway/src/feed.js` - ws fanout: `claims.role === 'admin'`
      skips the pid filter, admin sockets see the full firehose
- [x] types updated: `packages/contracts/types/events.d.ts`
      (`player.login.succeeded.v1` gains `role`), `apps/gateway/types/`
      (`queries.d.ts`, `routes.d.ts`, `main.d.ts`)
- [x] tests: `test/player.spec.js` (promotion, no-op re-promotion,
      `role` in the succeeded payload), `test/gateway.spec.js`
      (403 without the role, all 4 admin routes, admin ws firehose),
      real end-to-end via `test/gateway.integration.spec.js`'s `/login`
      call and `npm run smoke`

client stays untouched on purpose - it never read `pid`/`handle`/`role`
from the login response to begin with, only the token; a role-aware
client UI is phase 3+ (`phase.2.md` step 2.2 called this optional).

------------------------------------------------
step 2.1: living economy - done ✔
------------------------------------------------

`station_inventory`'s `stock`/`target` and `universe.js`'s
`produces`/`consumes` numbers existed since step 6 but the numbers
(`ore: 8`, `grain: 5`, …) were never read anywhere - seed.js only used
their *presence* to place a station at a fixed surplus/scarcity, once,
at boot. this step is their first real use.

- [x] `apps/market-service/src/drift.js` (new) - `pollDrift(pool,
      transact, { interval })`, same `poll()` shape as `pollOutbox` /
      `pollArrivals`. every tick: producers gain stock at their
      `produces` rate, consumers lose stock at their `consumes` rate,
      clamped to `[0, target * 2]` - an idle station settles at an
      extreme and goes quiet (the clamped `UPDATE ... WHERE stock <>
      ...` returns no row, so a settled pair emits nothing)
- [x] `apps/market-service/src/main.js` - `Market.start()`/`stop()`
      mirror ship-service's `arrivals` pattern for `this.drift`
- [x] `MARKET_DRIFT_INTERVAL` env var, default `1000`ms in production
- [x] `interval: 0` turns drift off entirely - `poll()` fires its first
      tick immediately and unstoppably, so a `.stop()` call right after
      `start()` cannot undo it. integration tests and `smoke` set
      `MARKET_DRIFT_INTERVAL=0` for this reason; drift's own behavior is
      covered by unit tests (`test/market.spec.js`) against a fake client
- [x] `apps/market-service/types/main.d.ts` - `start()`'s resolved type
      gains `drift: Poller`

bug caught mid-build, not by design review: an early draft called
`each()` (`garage/util`) with an async callback expecting it to wait -
`each()` is a synchronous loop, it does not await. `driftTick` returned
before any row had actually updated. caught by the unit test asserting
6 events, not by reading the code.

------------------------------------------------
travel timer persistence - done ✔
------------------------------------------------

phase 1 (steps 0-10) was done. this was the first phase 1.5+ item, picked
because it was a real bug: `apps/ship-service/src/handlers.js` scheduled
ship arrival with a raw in-process `setTimeout(arrive, trip.ms, ...)`.
restart ship-service while a ship was in transit and that timer was gone -
nothing ever called `arrive()` again, the ship sat at `status = 'transit'`
forever, `ship.arrived` never fired.

ship travel was the only deferred/timed state transition anywhere in this
codebase. `packages/db/src/outbox.js`'s `pollOutbox()` was the one
existing precedent for the fix shape - state lives in postgres, a periodic
loop claims what's due - so that's the shape this used, no new pattern.

- [x] `apps/ship-service/migrations/002_ships_correlation.sql` - `ships`
      gains nullable `causation_id`/`correlation_id` columns, persisted for
      the duration of a trip so a restart-recovered arrival can still
      correlate `ship.arrived` back to the original travel command
- [x] `apps/ship-service/src/handlers.js` - travel-request handler's
      `update ships` also writes `causation_id`/`correlation_id`; the
      `setTimeout` line and the module-level `arrive()` function are gone
- [x] `apps/ship-service/src/arrivals.js` (new) - `pollArrivals(pool,
      transact, {interval})` wraps `@theseus/util`'s `poll()` around one
      atomic `update ships set status='docked', stid="to", arrived=arrives
      where status='transit' and arrives <= now() returning ...` - one
      statement, not select-then-loop-update, so two overlapping pollers
      (e.g. mid-deploy) can't double-claim the same row
- [x] `apps/ship-service/src/main.js` - `Ship` overrides `start()`/`stop()`
      to own the poller's lifecycle; no changes to the shared
      `packages/service` base class, this is ship-specific
- [x] `.env.dev` - `SHIP_ARRIVAL_INTERVAL=25`, same rationale as
      `OUTBOX_INTERVAL=25` right above it
- [x] `test/ship.spec.js` - removed the 2 tests asserting the old
      `setTimeout`/mock-timers mechanism, added a `pollArrivals` section
      mirroring `test/db.spec.js`'s `pollOutbox` tests
- [x] `test/ship.integration.spec.js` - unchanged, still passes (already
      waited on events generically, unaware of the scheduling mechanism)
- [x] verified live: real broker + real postgres, killed ship-service
      mid-transit (`bash scripts/reboot.sh ship`), confirmed the row
      survived untouched and the fresh process's first poll tick docked it
      and published `ship.arrived.v1` through to the projection - the one
      scenario that was actually broken, with no automated test for
      "process died and came back" specifically
- [x] `apps/ship-service/readme.md`, `docs/game.md` - TODOs dropped

**real bug found while building this, not just the one it fixed**: the
first version emitted `ship.arrived` using the `arrived` column straight
off the `RETURNING` clause. `packages/db/src/pool.js` registers a custom
type parser for `timestamp` columns that returns a `Date` object, not a
string - but the event schema requires `field.isoTime` (a string).
`emit()` validates synchronously and throws, inside the transaction, so it
rolled back - meaning the ship silently stayed stuck in `transit` and the
poller died on its very first real arrival (an uncaught rejection inside
`poll()`'s tick loop stops rescheduling). caught immediately by running
`npm run test int` for real rather than trusting the design read-through;
fixed with `ship.arrived.toISOString()`.

------------------------------------------------
step 10: projection rebuild - done ✔
------------------------------------------------

truncate + replay from the event log.

**why**: hit it for real - `market.ships` (market-service's mirror,
rebuilt from `events.ship`) only had the 2 ships created after today's
`npm run start`; every older ship (going back a day+ in `ship.ships`,
ship-service's authoritative table) is invisible to it and trades against
those ships reject with `ship unknown`. root cause: a consumer group
resumes from its committed offset on restart rather than replaying
(`apps/gateway/src/main.js`'s own comment says as much) - if a projection
table ever gets emptied independently of that offset, it can never
self-heal. **scope decided**: build it for `projection-service` only
(matches phase.1.md's step 10 wording exactly, and it's the clean case -
zero FKs across all 6 migrations, zero saga state, everything genuinely
derivable by replay). `market-service`'s mirror has the identical exposure
but mixes pure mirrors (`ships`/`cargo`) with saga-owned tables
(`station_inventory`, `trades`) that a blanket truncate+replay would
wrongly wipe - leave that as a documented gap on
[market-service's readme](../apps/market-service/readme.md), not fixed
here.

**second data point, same day**: while verifying the cargo sell button,
`projection.market_prices` turned out stale too - `market.markets` had
sol.outpost/grain at `price_buy 68.75` but `projection.market_prices` was
still showing `41.04` (last written 2026-07-24 23:29, well before the
real price moved), so a buy at the client-displayed price got rejected
server-side as `price above limit` (the 10% headroom wasn't enough to
cover the drift). same mirror-goes-stale-and-never-heals shape as the
`ship unknown` case above, just hitting `market_prices` instead of
`ships` - another concrete argument for building step 10 exactly as
scoped (projection-service's tables) rather than treating today's
`ship unknown` as a one-off.

**design** (matches the sketch in `docs/dacrap/steps.p.md`'s old step 9,
and `permissions.md`'s "this is step 10" note): each opted-in service
keeps its own durable, append-only `event_log` (not a Kafka replay - kafka
has no offset-reset/admin capability in `packages/kafka` today, and topics
aren't infinite-retention anyway). rebuild = truncate the read-model
tables + replay `event_log` ordered by `received, eid` - this service's
own write order, not the producer-side `occurred` clock (different
producers' clocks aren't guaranteed monotonic relative to each other;
`received` is assigned by this one consumer writing sequentially, so it
matches true consumption order) - through the exact same handler map the
live consumer uses - never touches kafka/inbox at all.

- [x] `packages/service/src/index.js` - `static logEvents = false` (opt-in
      per service), `Service.start()` writes every consumed event to
      `event_log` before dispatch when the subclass sets it `true`
- [x] `apps/projection-service/migrations/007_event_log.sql` - `eid` pk,
      `event_type`, `payload` jsonb, `occurred`, `received`
- [x] `apps/projection-service/src/main.js` - `logEvents = true`, exports
      `createHandlers` (package `exports` map only exposed `main.js` before)
- [x] `scripts/rebuild.js` + `npm run rebuild` - truncate `players` /
      `wallets` / `ships` / `cargo` / `market_prices` / `trade_history`,
      replay `event_log` through `createHandlers()`'s dispatch map. run
      with projection-service stopped (documented, not enforced)
- [x] `test/projection.rebuild.integration.spec.js` - full loop through
      real handlers (player → ship → market buy/travel/sell), snapshot the
      6 tables' business columns, rebuild, snapshot again,
      `assert.deepEqual` - identical every time; also re-ran
      `npm run rebuild` back-to-back by hand against `theseus_test` to
      confirm the truncate+replay itself is idempotent
- [x] `apps/market-service/readme.md` - doc note on the same staleness
      risk, explicitly out of scope for this pass

**important gap, not a bug**: `event_log` only fills going forward from the
moment a service restarts with `logEvents = true` - it cannot backfill
events consumed before that. once the table exists, `npm run rebuild`
truncates and replays unconditionally - if `event_log` covers less than
the read models' full history, everything outside that window is silently
gone, no warning. the only free pass is before the table exists at all
(the transaction then rolls back on the missing-relation error, a no-op).
**do not run `npm run rebuild` against the real `theseus` db** until
`projection-service` has been running continuously on this code for at
least as long as the oldest row worth keeping.

admin-gated `POST /admin/rebuild` from `permissions.md` stays separate -
depends on role plumbing (`players.role`, `requireRole`, JWT claim) which
doesn't exist yet either (confirmed: no `role` column, no `requireRole`,
no admin routes anywhere in the repo). this step shipped as a plain script
first, matching `services:check`/`infra:health`/`smoke`.

------------------------------------------------
step 9: minimal client - done ✔
------------------------------------------------

single html file, websocket-driven - plan in [client.md](client.md)

- [x] `client/` (`index.html` + `style.css` + `app.js`) - top-level, not
      nested in the gateway app, not an npm package. terminal theme (dark, monospace, phosphor glow,
      css scanlines), no framework, no external assets
- [x] `GET /` `GET /universe` - public routes on the gateway, `clientPath`
      threaded `opt.x ?? readEnv('GATEWAY_CLIENT_PATH', ...)` same as every
      other gateway config value; universe/goods/starter serialized once
- [x] auth screen - register (201 auto-login / 409 / 202 queued+retry),
      login, token in `localStorage`, auto-login on reload
- [x] hydrate - `/me` retried during projection lag, `/universe` once,
      `/ships` `/cargo/:sid` `/market/:stid` `/trades`
- [x] websocket feed - `?token=` query, dispatch table per event type,
      pending-command correlation (✓/✗ marks the original feed line),
      reconnect with exponential backoff (capped 10s) + re-hydrate
- [x] live flavor - years-rel/years-abs copy, eta + capital-cost route
      previews mirroring `@theseus/domain`'s trade math, buy/sell slack
      hints, disabled/empty states throughout
- [x] found + fixed in manual verification: `packages/db` had no utc
      override for postgres `timestamp` columns - the `pg` driver read them
      back in the host's local timezone instead of utc, so the countdown
      showed "arriving…" immediately instead of counting down. one-line
      fix (`pg.types.setTypeParser`) + regression test, see decisions log
- [x] verified live in a real browser (playwright via docker mcp toolkit):
      register → login → buy → travel → live countdown → arrival,
      gateway kill/restart → client reconnects and re-hydrates, logout

------------------------------------------------

step 8: gateway (http + websocket) - done ✔
------------------------------------------------

details in [apps/gateway/readme.md](../apps/gateway/readme.md)

- [x] **real kafka connection** - done (details in [kafka readme](../packages/kafka/readme.md)):
    - [x] `kafka/src/client.js` - `createKafkaClient({ brokers, clientId })` via `kafkajs`;
          topics ensured before subscribe (serialized), transient broker errors retried
    - [x] the little refactor - services are classes now: [`@theseus/service`](../packages/service/readme.md)
          base owns the lifecycle, `Kind.run()` is the composition root -
          `node apps/<svc>/src/main.js` actually boots against compose
    - [x] `events.all` fanout gap fixed - projection subscribes to the concrete event topics
    - [x] `npm run smoke` - the full loop through the REAL broker: register → buy ore →
          fly → sell → profit ₢830.68, projection read models populated;
          repeat runs resume consumer groups, inbox dedup holds
    - [x] `util.guid(prefix?)` - the one id helper, `crypto.randomUUID` imports gone
    - [x] `.env.dev` - test knobs stacked via `--env-file`, spec env hacks removed
- [x] `@theseus/auth` - `signJwt` / `verifyJwt` / `createAuth({ secret, ttl })` -
      hand-rolled HS256, `verify` throws a coded `Fail` (401) on bad/expired/malformed
      tokens; secret stays out of player-service, see [readme](../packages/auth/readme.md)
- [x] http routes → commands - `garage` app, payload validated pre-publish (417 → 400),
      `pid` from token claims, 202 `{ cmd, correlation_id }`
- [x] `POST /register` / `POST /login` - correlated reply over `events.player`
      (new `player.login.requested.v1` + `login.succeeded/rejected.v1`), gateway
      signs JWT; 201/409/202 register, 200/401/504 login
- [x] read routes against projection tables - `/me` `/ships` `/cargo/:sid`
      `/market/:stid` `/trades`
- [x] websocket event feed - hand-rolled rfc 6455, `?token=` before the 101,
      per-pid fanout + price broadcast, ping/pong keepalive; `scripts/ws-probe.js`
- [x] tests - 29 unit (routes, frame codec, handshake, fanout, heartbeat, waiter),
      7 integration (register → login → /me, command lands, ws filtering)

------------------------------------------------

step 6: market service - done ✔
------------------------------------------------

- [x] scaffold - deps, `main.js`, `handlers.js`, `seed.js`, pg schema `market`
- [x] migrations - markets (quote board), station_inventory (source of truth),
      ships (mirror), cargo, trades (saga state machine)
- [x] seed - stock + quotes per station × good from universe economy profiles,
      `market.price.changed.v1` published for each (the deferred step-5 item)
- [x] the locked stock - sagas `select … for update` the inventory row and
      compute prices from it; `markets` is write-only for trade logic
- [x] buy saga - reserve stock → `wallet.debit.requested` (rfid = tid) →
      on `wallet.debited`: cargo loaded, trade executed, quote republished
- [x] sell saga - hand over cargo → `wallet.credit.requested` →
      on `wallet.credited`: station restocked, trade executed, quote republished
- [x] compensation - wallet rejection releases stock (buy) or returns cargo (sell)
- [x] ships mirror from `events.ship` - docked/transit + capacity checks
- [x] kafka `createCommander` - command sibling of `createEmitter`
- [x] tests - 21 unit (rejections, reserve, settle, compensation, mirror, seed);
      market integration (reserve → debit → settle); **full game loop**:
      register → buy ore → fly → sell → trader ends richer than ₢1000



------------------------------------------------

done
------------------------------------------------

| step | what                                                                  |
|------|-----------------------------------------------------------------------|
| 0    | rename pass on [contracts](../packages/contracts/readme.md)           |
| 1    | [db package](../packages/db/readme.md) - pool, inbox/outbox, migrate  |
| 2    | [projection service](../apps/projection-service/readme.md)            |
| 3    | [player service](../apps/player-service/readme.md) - register, wallet |
| 4    | [ship service](../apps/ship-service/readme.md) - travel + starter saga|
| 5    | universe seed - [domain](../packages/domain/readme.md) graph, goods, economy |
| 6    | [market service](../apps/market-service/readme.md) - buy/sell sagas, prices |

also: CI (github actions, node 26), pre-push env hook, pg schema per service,
integration test harness in [testing](../packages/testing/readme.md).

------------------------------------------------


decisions log
------------------------------------------------

- password hashing        : `node:crypto` scrypt - no pg extension, hash before it hits the DB
- station vs port rename  : keep `station / stid` - port is UI copy only
- outbox pattern          : write + domain in one tx; polling loop publishes to kafka
- migration conflicts     : postgres schema per service - `DB.create({ schema })` sets `search_path`,
                            each schema gets its own tables + `schema_migrations`; db-per-service deferred
- starter ship            : ship-service saga on `player.created.v1` - ownership stays with ship-service
- universe                : graph in `@theseus/domain` - nodes with economy profile, undirected edges
- market prices           : float on supply/demand (`price` + `spread`), no fixed state prices
- cargo ownership         : market-service owns cargo + keeps a ships mirror from `events.ship` -
                            trades touch stock/cargo/prices in one service, the only saga hop is the wallet
- the locked stock        : sagas `select … for update` the inventory row and compute prices
                            from it; `markets` is a write-only quote board, nothing ever joins them
- auth
    - gateway issues JWT on login, validates locally, player service not called at read time
    - `@theseus/auth` (signJwt/verifyJwt) deferred to step 7 - keeps JWT secret out of player service
- login over kafka       : `player.login.requested.v1` command, player-service verifies the hash
                           and replies `login.succeeded/rejected.v1` - hash never leaves player-service;
                           reply is direct-published (no outbox: nothing to keep atomic, no ~1s poll
                           latency, no auth noise in the durable log); gateway awaits by correlation_id
- passwords in transit   : plaintext inside `commands.player` payloads (register always worked this
                           way) - broker is docker-internal, accepted for now; mitigations if it ever
                           matters: topic retention, broker tls. pre-hashing client-side is pointless,
                           the digest would just become the password
- gateway http           : `garage` (the house lib) - router, middleware, `Fail.code` → http status
- gateway ws             : hand-rolled rfc 6455, jwt via `?token=` checked before the 101
                           (browsers cannot set ws headers); stable consumer group `gateway` on the
                           five concrete event topics - resumes offsets instead of replaying per boot
- crypto split
    - `player/src/crypto.js` owns `hash`/`verify` (credential management only)
- client location        : top-level `client/index.html`, not nested in the gateway app and not
                           an npm package - cors was never about file location, only which process
                           serves the response, so the gateway can keep being the sole server without
                           owning the client's code. path is `GATEWAY_CLIENT_PATH`, threaded the same
                           `opt.x ?? readEnv(...)` way as every other gateway config value
- utc timestamps          : `packages/db`'s pool now forces `pg.types.setTypeParser(1114, ...)` to
                           read naive `timestamp` columns as utc - the driver's default parses them
                           in the host's local timezone, silently shifting every value by the host's
                           utc offset (found via the client's live countdown reading an `arrives` 3
                           hours in the past on a UTC+3 dev machine). affects every naive-timestamp
                           column project-wide (ships, players, wallets, trade_history, ...), fixed
                           once at the driver level - no schema/migration change


------------------------------------------------

tech debth & refactors
------------------------------------------------
### ship update
should be able to rename player's ships


### permissions - roles and visibility
design note in [permissions.md](permissions.md) - `players.role` →
login reply → JWT claim → `requireRole('admin')` middleware, role-aware
ws fanout, read-only admin surface + `POST /admin/rebuild` (step 10's home).
decided: ship traffic + market transactions public by default, future
transponder-off mechanic hides movement. still open: leaderboard, admin
powers, admin bootstrap. plumb roles before the html client (step 9).

### kafkajs `TimeoutNegativeWarning`
upstream quirk in kafkajs' request queue (`scheduleCheckPendingRequests`
computes a negative delay, node clamps to 1ms) - harmless noise on boot,
not our code. revisit if kafkajs ships a fix or we swap clients.

### gateway logger
gateway should use logger, the logger should live in `garage/mware`

### websocket lib - done ✔
extracted to [`packages/ws`](../packages/ws/readme.md)
still needs moving to `garage`

### garage
1. `Sync.parse` throws if `response.ok` is `false` - make it optional
2. `Fail` refactor, `code` should be optional, map system error errno to http status
3. add useful `middleware` under `garage/mware` like `logger`, `cors`, `etag`, `gzip` etc...

### `pkg/util`
- `garage/util/Fail` fix msg/code bug or create `class Chaos extends Error` instead

### cleanup & order
move to `pkg/db` from `pkg/util`
- `Query`
- `where`
- `selectWhere`
- `withClient`

### npm version
    a version bump script for each app/pkg.

### `setTimeout` as travel timer
    in-process `setTimeout`, doesn't survive restarts.
    postgres as durable schedule or redis.

### `Universe` path
    dijkstra multi hop routing, when the map outgrows
    the fully connected triangle.

### `market:sagas`
    add `auction` saga, when players can bid against other players

------------------------------------------------

### admin dashboard
the game needs an admin dashboard
1. manage game assets
2. deployment tasks
3. monitoring (grafana, kibana, prometheus)

### game assets
lives in text file, read on startup and populate.
consider dedicated table
- ships
- goods
- stations
- weapons
- armor
- etc...