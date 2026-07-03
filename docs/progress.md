theseus - phase 1 progress
================================================

steps
------------------------------------------------

- [x] [repo skeleton](../readme.md)
- [x] [docker compose / local infra](../infra/readme.md)
- [x] [contracts package](../packages/contracts/readme.md)
- [x] [kafka package](../packages/kafka/readme.md)
- [x] **step 0** - rename pass on existing contracts
- [x] tests - 65 passing, 85% coverage gate, config/contracts/kafka/db/util
- [x] CI - github actions, pre-push hook, garage → npm
- [x] **step 1** - [db package (pool, inbox, outbox, migrate)](../packages/db/readme.md)
- [x] **step 2** - [projection service](../apps/projection-service/readme.md)
- [x] **step 3** - [player service](../apps/player-service/readme.md)
- [x] **step 4** - [ship service + travel](../apps/ship-service/readme.md)
- [ ] **step 5** - universe seed
- [ ] **step 6** - [market service: buy + sell sagas](../apps/market-service/readme.md)
- [ ] **step 7** - [gateway: http + websocket](../apps/gateway/readme.md)
- [ ] **step 8** - minimal client
- [ ] **step 9** - projection rebuild


current - step 5: universe seed
------------------------------------------------

- stations + distances already live in `ship-service/src/travel.js`
- constants ready: `STARTER_SHIP`, `STARTER_CREDITS`, `TIME_SCALE`

### plan (draft)
- [ ] goods catalog - `gid` list (name, base price)
- [ ] initial `market_prices` per station
- [ ] starter ship per new player - `STARTER_SHIP` docked at `sol.outpost`,
      emitted as `ship.created.v1` so both ship-service and projection pick it up
- [ ] seed entrypoint - `scripts/seed.js`? publish events vs direct sql?

### open questions
- who emits the starter ship - player registration handler or the seed script?
- do goods/prices live in market-service migrations or in seed data?


step 4: ship service + travel - done ✔
------------------------------------------------

- owns `ships` write model in pg schema `ship`
- handles 1 command
- emits 3 event types
- travel timer is in-process `setTimeout` - doesn't survive restarts, acceptable for now
- ship travels `sol.outpost` → `alpha.exchange` in `~143s` game time (4.3 ly / 0.6c × 20 s/year)
- `departed` + `arrived` events flow through outbox

------------------------------------------------------------------------------------------------

### scaffold
- [x] deps: `package.json`
    - `@theseus/db`
    - `@theseus/kafka`
    - `@theseus/contracts`
    - `@theseus/config`
    - `@theseus/util`

- [x] `src/main.js`     - pool → migrate → inbox → consumer(`commands.ship`) + `pollOutbox`
- [x] `src/handlers.js` - dispatch map + travelRequested / arrive / reject
- [x] `src/travel.js`   - distance/time math, route keys normalized to sorted order

------------------------------------------------------------------------------------------------

### migrations
- [x] `001_ships.sql` : `create table ships`

------------------------------------------------------------------------------------------------

### travel math `src/travel.js`
- [x] station distance map - hardcoded from constants
- [x] years `abs = distance / velocity`
- [x] years `rel = years_abs * sqrt(1 - velocity²)` - relativistic proper time
- [x] `ms = abs * TIME_SCALE * 1000` - game milliseconds

------------------------------------------------------------------------------------------------

### handler: `ship.travel.requested.v1`
- [x] fetch ship, reject if not found
- [x] reject if not docked (`status !== 'docked'`)
- [x] reject if ship not at `from` station (`stid !== from`)
- [x] reject if `from === to`
- [x] calculate travel time → `{ ms, arrives, years_abs, years_rel }`
- [x] update ship: `status = 'transit'`, `departs = now`, `from`, `to`, `arrives`
- [x] write to outbox → `ship.departed.v1` `{ sid, pid, from, to, departed, arrives, years_abs, years_rel }`
- [x] `setTimeout(ms)` scheduled after commit (rollback must not dock the ship) → transact:
  - update ship: `status='docked'`, `stid=to`, `arrived=now`
  - outbox → `ship.arrived.v1` `{ sid, pid, stid, arrived }`

------------------------------------------------------------------------------------------------

### idempotency
- [x] inbox dedup on `cmd`

------------------------------------------------------------------------------------------------

### tests
- [x] unit: travel math (`distance`, `years_abs`, `years_rel`, `ms`)
- [x] unit: handler - travel rejected (not found, not docked, wrong station, same station)
- [x] unit: handler - departed event emitted with correct payload
- [x] unit: handler - arrived event emitted after timeout (mock timers)
- [x] integration: full travel flow - departed → wait → arrived in DB



decisions log
------------------------------------------------

- password hashing        : `node:crypto` scrypt  - no pg extension, hash before it hits the DB
- station vs port rename  : keep `station / stid` - port is UI copy only
- outbox pattern          : write + domain in one tx; polling loop publishes to kafka
- migration conflicts     : postgres schema per service - `DB.create({ schema })` sets `search_path`, each schema gets its own tables + `schema_migrations`; db-per-service deferred
- auth
    - gateway issues JWT on login,
    - validates locally, player service not called at read time
- crypto split
    - `player/src/crypto.js` owns `hash`/`verify` (credential management only)
    - `@theseus/auth` owns `signJwt`/`verifyJwt` (shared between gateway and any other auth service)





### `@theseus/auth` - deferred to step 7 (gateway)

concerns:
- `hash` / `verify` are credential ops - player service only, no reason to share
- `signJwt` - gateway signs on successful login; player service never sees a token
- `verifyJwt` - gateway validates on every request; other services trust the gateway, don't re-verify
- keeping JWT secret out of player service reduces blast radius if player service is compromised
- if a future service needs token validation directly (e.g. websocket), it imports from `@theseus/auth`



naming reference
------------------------------------------------

### ids

| long         | short |
|--------------|-------|
| player_id    | pid   |
| ship_id      | sid   |
| station_id   | stid  |
| good_id      | gid   |
| event_id     | eid   |
| wallet_id    | wid   |
| market_id    | mid   |
| cargo_id     | cid   |
| command_id   | cmd   |
| trade_id     | tid   |
| reference_id | rfid  |

#### compound:
`from_station → from`
`to_station   → to`


### timestamps - drop `_at`

| long         | short     |
|--------------|-----------|
| created_at   | created   |
| updated_at   | updated   |
| occurred_at  | occurred  |
| arrived_at   | arrived   |
| departed_at  | departed  |
| arrives_at   | arrives   |
| requested_at | requested |

### prices

| long            | short          |
|-----------------|----------------|
| unit_price      | price_unit     |
| total_price     | price_total    |
| buy_price       | price_buy      |
| sell_price      | price_sell     |
| max_unit_price  | price_unit_max |
| min_unit_price  | price_unit_min |

### other

| long               | short         |
|--------------------|---------------|
| velocity_c         | velocity      |
| cargo_cap          | capacity      |
| ship_frame_years   | years_rel     |
| common_frame_years | years_abs     |
| password_hash      | hash          |


constants
------------------------------------------------

```js
const TIME_SCALE      = 20      // 1 common-frame year = 20 game seconds
const INTEREST_RATE   = 0.05
const STARTER_CREDITS = 1000

const STARTER_SHIP = {
    name: 'far treasure',
    stid: 'sol.outpost'
    velocity: 0.6,
    capacity: 20,
}
```

```
sol.outpost    ↔ alpha.exchange  4.3 ly  → 143s travel at 0.6c
alpha.exchange ↔ barnards.port   5.9 ly  → 197s
sol.outpost    ↔ barnards.port   6.0 ly  → 200s
```


refactors, todos and tech debth
------------------------------------------------


- ### migrations table conflicts
    all services share one postgres in dev/ci, two conflicts:

    1. **loud** - `ship/001_ships.sql` and `projection/003_ships.sql` both `create table ships`.
       different filenames, both run - second one throws `relation "ships" already exists`.
    2. **silent** - `schema_migrations` keys by bare filename (`db/src/migrate.js`).
       player and projection both have `001_players.sql` / `002_wallets.sql` -
       whichever service migrates first wins, the other is silently skipped,
       even though the table shapes differ.

    options considered:

    | option                       | verdict                                          |
    |------------------------------|--------------------------------------------------|
    | db per service               | proper fix, infra heavy - deferred               |
    | postgres schema per service  | lighter proper fix - **chosen, implemented**     |
    | rename projection tables     | fixes 1 only - cheap                             |
    | track by `service/filename`  | fixes 2 only - turns silent skip into loud crash |
    | `create table if not exists` | hides 1, shapes differ - no                      |

    **implemented:** `DB.create({ schema })` sets `search_path` on the pool,
    `migrate` runs `create schema if not exists` first - existing sql untouched,
    each schema gets its own tables, inbox/outbox and `schema_migrations`.
    step 9 rebuild = `drop schema projection cascade` → migrate → replay.

    **deferred:** db per service - only if services ever need
    independent scaling / backup / access control.

    schema per service plan:

    ```
                                  postgres (one container, one db)
    ┌───────────────────────────────────────────────────────────────────────────────┐
    │                                                                               │
    │  schema: player            schema: ship              schema: projection       │
    │  ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐  │
    │  │ players             │   │                     │   │ players             │  │
    │  │ wallets             │   │                     │   │ wallets             │  │
    │  │ wallet_transactions │   │ ships               │   │ ships    ← no clash │  │
    │  │                     │   │                     │   │ cargo               │  │
    │  │                     │   │                     │   │ market_prices       │  │
    │  │                     │   │                     │   │ trade_history       │  │
    │  ├─────────────────────┤   ├─────────────────────┤   ├─────────────────────┤  │
    │  │ inbox               │   │ inbox               │   │ inbox               │  │
    │  │ outbox              │   │ outbox              │   │                     │  │
    │  ├┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┤   ├┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┤   ├┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┬┤  │
    │  ├┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┤   ├┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┤   ├┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┴┤  │
    │  │ schema_migrations   │   │ schema_migrations   │   │ schema_migrations   │  │
    │  ├─────────────────────┤   ├─────────────────────┤   ├─────────────────────┤  │
    │  │ 001_players.sql     │   │ 001_ships.sql       │   │ 001_players.sql     │  │
    │  │ 002_wallets.sql     │   │                     │   │ 002_wallets.sql     │  │
    │  │ 003_wallet_tx.sql   │   │                     │   │ 003_ships.sql   …   │  │
    │  └─────────────────────┘   └─────────────────────┘   └─────────────────────┘  │
    │            ↑                         ↑                         ↑              │
    └────────────┼─────────────────────────┼─────────────────────────┼──────────────┘
                 │                         │                         │
         set search_path            set search_path           set search_path
           to player                    to ship                 to projection
                 │                         │                         │
    ┌────────────┴────────┐   ┌────────────┴────────┐   ┌────────────┴────────┐
    │ player-service      │   │ ship-service        │   │ projection-service  │
    │ DB.create({schema}) │   │ DB.create({schema}) │   │ DB.create({schema}) │
    └─────────────────────┘   └─────────────────────┘   └─────────────────────┘
    ```

    - `search_path` set per pool - existing sql untouched, `from ships` resolves to own schema
    - `schema_migrations` lands in each schema - tracker isolated for free, no rename needed
    - step `9` rebuild = `drop schema projection cascade` → migrate → replay
    - integration tests peek with explicit prefix: `select * from player.players`

- ### travel timer
    travel timer is in-process uses `setTimeout`.
    think about more persistant solution. maybe `redis`

- ### game locations
    game locations will probably grow,
    needs better `DISTANCES` map.

    ```js
    const DISTANCES = {
        'sol.outpost:alpha.exchange'  : 4.3,
        'sol.outpost:barnards.port'   : 6.0,
        'alpha.exchange:barnards.port': 5.9,
    }
    ```

- use `Symbols` for `commands`/`events`
    ```js
    export const commandTopics = {
        ship  : Symbol('commands.ship'),
        cargo : Symbol('commands.cargo'),
        market: Symbol('commands.market'),
        wallet: Symbol('commands.wallet'),
        player: Symbol('commands.player'),
    }
    ```