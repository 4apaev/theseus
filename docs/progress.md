theseus - progress
================================================

full step list + reference: [phase.1.md](phase.1.md) · game design: [game.md](game.md)


current - step 7: gateway (http + websocket)
------------------------------------------------

plan lives in [apps/gateway/readme.md](../apps/gateway/readme.md) - not started

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
- [ ] `@theseus/auth` - signJwt / verifyJwt
- [ ] http routes → commands via kafka's `createCommander`
- [ ] read routes against projection tables
- [ ] websocket event feed


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
- crypto split
    - `player/src/crypto.js` owns `hash`/`verify` (credential management only)


refactors, todos and tech debt
------------------------------------------------

- #### kafkajs `TimeoutNegativeWarning`
    upstream quirk in kafkajs' request queue (`scheduleCheckPendingRequests`
    computes a negative delay, node clamps to 1ms) - harmless noise on boot,
    not our code. revisit if kafkajs ships a fix or we swap clients.

- ### `market:sagas`
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

