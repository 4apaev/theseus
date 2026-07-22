theseus - progress
================================================

full step list + reference: [phase.1.md](phase.1.md) · game design: [game.md](game.md) · roles design: [permissions.md](permissions.md)


current - step 8: minimal client
------------------------------------------------

single html file, websocket-driven - not started


step 7: gateway (http + websocket) - done ✔
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


refactors, todos and tech debt
------------------------------------------------


- #### admin dashboard
    the game needs an admin dashboard
    1. manage game assets
    2. deployment tasks
    3. monitoring (grafana, kibana, prometheus)

- #### delta v
    add real delta v calculus to the game,
    accelerate + blaming + mass of fuel and mass of the ship + cargo
    1. introduce `cargo` `weight` field
    2. introduce `fuel` entity with `mass`, `type`, etc...

- #### permissions - roles and visibility
    design note in [permissions.md](permissions.md) - `players.role` →
    login reply → JWT claim → `requireRole('admin')` middleware, role-aware
    ws fanout, read-only admin surface + `POST /admin/rebuild` (step 10's home).
    decided: ship traffic + market transactions public by default, future
    transponder-off mechanic hides movement. still open: leaderboard, admin
    powers, admin bootstrap. plumb roles before the html client (step 9).

- #### gateway logger
    gateway should use logger, the logger should live in `garage/mware`

- #### websocket lib - done ✔
    extracted to [`packages/ws`](../packages/ws/readme.md) - `../garage` had
    unrelated uncommitted work in progress and theseus's `node_modules/garage`
    is a separately-installed copy, not live-linked, so landing it there
    would've been invisible until a publish+bump cycle. protocol only
    (handshake, frame codec, keepalive, opaque `authenticate`/`each` registry) -
    `apps/gateway/src/feed.js` is the game-specific pid/jwt fanout on top.
    still worth upstreaming into `garage/ws` later once that repo settles -
    the code itself won't need to change, just its address.

- #### garage
    1. `Sync.parse` throws if `response.ok` is `false` - make it optional
    2. `Fail` refactor, `code` should be optional, map system error errno to http status
    3. add useful `middleware` under `garage/mware` like `logger`, `cors`, `etag`, `gzip` etc...

- #### kafkajs `TimeoutNegativeWarning`
    upstream quirk in kafkajs' request queue (`scheduleCheckPendingRequests`
    computes a negative delay, node clamps to 1ms) - harmless noise on boot,
    not our code. revisit if kafkajs ships a fix or we swap clients.

- #### `market:sagas`
    add `auction` saga, when players can bid against `station:good`

- #### `pkg/util`
    - `poll` with arguments, returns callable function.
    ```js
        export function poll(fx, ms, max = Infinity) {
            ms = formatTime(ms ?? 0)
            let rs, tid, end = 0
            return O.use(async function tick(...a) {
                rs = await fx.apply(this, a)
                if (end || max--< 1) return end = 1
                tid = setTimeout(tick, ms, ...a)
            }, {
                get result() { return rs },
                stop() {
                    end = 1
                    clearTimeout(tid)
                }})
        }
    ```
    - move to `pkg/db from` `pkg/util`:
        - `Query`
        - `where`
        - `selectWhere`
        - `withClient`

    - `garage/util/Fail` fix msg/code bug or create `class Chaos extends Error` instead


- #### game assets
    lives in text file, read on startup and populate.
    consider dedicated table
    - ships
    - goods
    - stations
    - weapons
    - armor
    - etc...

- #### npm version
    a version bump script for each app/pkg.

- #### `setTimeout` as travel timer
    in-process `setTimeout`, doesn't survive restarts.
    postgres as durable schedule or redis.

- #### `Universe` path
    dijkstra multi hop routing, when the map outgrows
    the fully connected triangle.

- #### `Symbol` for topics / events
    maybe `Symbol(cmd.ship)` instead of strings

