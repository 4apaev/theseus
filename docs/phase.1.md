phase 1 - vertical slice
================================================

a playable vertical slice, not infrastructure cosplay: one loop where a player
registers, gets a ship, travels, trades, and sees live updates. what the game
is and why - see [game.md](game.md). current work - see [progress.md](progress.md).


steps
------------------------------------------------

| step   | what                                                                                                                          | status  |
|--------|-------------------------------------------------------------------------------------------------------------------------------|---------|
|   0    | [contracts](../packages/contracts/readme.md)               - `@theseus/contracts`  rename pass on existing contracts          | done    |
|   1    | [db package](../packages/db/readme.md)                     - `@theseus/db`         pool, inbox, outbox, migrate               | done    |
|   2    | [projection service](../apps/projection-service/readme.md) - `@theseus/projection` read models                                | done    |
|   3    | [player service](../apps/player-service/readme.md)         - `@theseus/player`     register, wallet                           | done    |
|   4    | [ship service](../apps/ship-service/readme.md)             - `@theseus/ship`       travel                                     | done    |
|   5    | [domain](../packages/domain/readme.md)                     - `@theseus/domain`     universe seed, graph, goods, starter ship  | done    |
|   6    | [market service](../apps/market-service/readme.md)         - `@theseus/market`     buy + sell sagas                           | done    |
|   7    | [auth](../packages/auth/readme.md)                         - `@theseus/auth`       sign / verify / create                     | done    |
|   8    | [gateway](../apps/gateway/readme.md)                       - `@theseus/gateway`    http + websocket                           | done    |
|  [9]   | minimal client - single html file, websocket-driven                                                                           | current |
|  10    | projection rebuild - truncate + replay from event log                                                                         | todo    |


### packages

| package                                        | role                                              |
|------------------------------------------------|---------------------------------------------------|
| [contracts](../packages/contracts/readme.md)   | commands, events, topics, envelopes - the vocab   |
| [kafka](../packages/kafka/readme.md)           | producer / consumer / memory broker               |
| [db](../packages/db/readme.md)                 | pool, schema per service, inbox / outbox, migrate |
| [service](../packages/service/readme.md)       | Service base class - lifecycle, `Kind.run()` root |
| [domain](../packages/domain/readme.md)         | pure math + universe graph, goods, economy        |
| [config](../packages/config/readme.md)         | env access, service boot                          |
| [util](../packages/util/readme.md)             | garage re-exports, codec, sql builders, errors    |
| [auth](../packages/auth/readme.md)             | sign / verify - the gateway's token secret        |
| [testing](../packages/testing/readme.md)       | mocks, integration harness, spec title banners    |


success criteria
------------------------------------------------

phase 1 is done when this path works end to end:

 1. start docker compose
 2. register a player through the gateway
 3. system emits `player.created.v1`
 4. player service emits `wallet.created.v1`
 5. ship service emits `ship.created.v1`
 6. projection service builds a player overview
 7. client opens websocket
 8. player buys cargo at a station
 9. ship cargo updates live
10. player requests travel
11. ship departs, waits, and arrives
12. player sells cargo
13. wallet, cargo, market, and event log projections all update

smoke test path:
`register → buy at sol.outpost → travel to alpha.exchange → sell → profit
= sell_total − buy_total − capitalCost(buy_total, 0.05, years_abs)`


architecture
------------------------------------------------

```
┌──────────────────────────────┐
│            client            │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│           gateway            │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│     kafka command topics     │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│       domain services        │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│      kafka event topics      │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│      projection service      │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│     postgres read models     │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│    gateway websocket feed    │
└──────────────────────────────┘
```

the gateway accepts intent. domain services decide what is true.
commands are requests. events are facts.


### rules for not making a mess

1. every event has an id
2. consumers must be idempotent - inbox dedup on `eid` / `cmd`
3. commands may fail; events should not
4. services own their own writes - one pg schema per service
5. gateway does not mutate game state directly
6. projection db is disposable - rebuilt by replaying events
7. at-least-once delivery assumptions everywhere
8. log every event


envelopes
------------------------------------------------

command:

```json
{
    "cmd"           : "...uuid...",
    "command_type"  : "ship.travel.requested.v1",
    "requested"     : "2026-06-10T12:00:00.000Z",
    "requested_by"  : "player_01h/...",
    "correlation_id": "...",
    "payload"       : {}
}
```

event:

```json
{
    "eid"              : "...uuid...",
    "event_type"       : "ship.departed.v1",
    "aggregate_type"   : "ship",
    "aggregate_id"     : "ship_01h...",
    "aggregate_version": 3,
    "occurred"         : "2026-06-10T12:00:00.000Z",
    "causation_id"     : "cmd ...",
    "correlation_id"   : "...",
    "producer"         : "ship-service",
    "payload"          : {}
}
```

### topics

```
commands.player  commands.wallet  commands.ship  commands.cargo  commands.market
events.player    events.wallet    events.ship    events.cargo    events.market
events.all       - fanout for projection / websocket
```

keying: player/wallet events by `pid`, ship/cargo by `sid`, market by `stid`.


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

compound: `from_station → from`, `to_station → to`

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

| long               | short     |
|--------------------|-----------|
| velocity_c         | velocity  |
| cargo_cap          | capacity  |
| ship_frame_years   | years_rel |
| common_frame_years | years_abs |
| password_hash      | hash      |


schemas
------------------------------------------------

per-service tables live in each service's readme (migrations section).
one postgres, one schema per service (`player` / `ship` / `projection`) -
`DB.create({ schema })` sets `search_path`, each schema gets its own tables,
inbox/outbox and `schema_migrations`. same names never collide.

```
  schema: player            schema: ship             schema: projection
  ┌─────────────────────┐   ┌──────────────────┐   ┌─────────────────────┐
  │ players             │   │ ships            │   │ players   wallets   │
  │ wallets             │   │                  │   │ ships     cargo     │
  │ wallet_transactions │   │                  │   │ market_prices       │
  │ inbox / outbox      │   │ inbox / outbox   │   │ trade_history       │
  │ schema_migrations   │   │ schema_migrations│   │ inbox + migrations  │
  └─────────────────────┘   └──────────────────┘   └─────────────────────┘
```
