theseus - progress
================================================

full step list + reference: [phase.1.md](phase.1.md) · game design: [game.md](game.md)


current - step 6: market service (buy + sell sagas)
------------------------------------------------

plan lives in [apps/market-service/readme.md](../apps/market-service/readme.md)

- [ ] scaffold - deps, `main.js`, `handlers.js`, `saga.js`
- [ ] migrations - markets, station_inventory, cargo, trades (schema `market`)
- [ ] buy saga - reserve stock → `wallet.debit.requested` → cargo load → `trade.executed`
- [ ] sell saga - unload cargo → `wallet.credit.requested` → restock → `trade.executed`
- [ ] compensation - stock released on wallet rejection
- [ ] pricing - `price()` + `spread()` from `@theseus/domain` economy, seed
      initial `market_prices` via `market.price.changed.v1`
- [ ] idempotency - inbox dedup, `tid` as `rfid` for wallet commands
- [ ] tests - unit rejections + saga compensation; integration full buy/sell flow


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
- auth
    - gateway issues JWT on login, validates locally, player service not called at read time
    - `@theseus/auth` (signJwt/verifyJwt) deferred to step 7 - keeps JWT secret out of player service
- crypto split
    - `player/src/crypto.js` owns `hash`/`verify` (credential management only)


refactors, todos and tech debt
------------------------------------------------

- **travel timer** - in-process `setTimeout`, doesn't survive restarts.
  postgres as durable schedule (poll `arrives <= now()`) or redis, later.

- **`Universe.path()`** - dijkstra multi-hop routing, when the map outgrows
  the fully-connected triangle.

- **symbols for topics** - maybe `Symbol('commands.ship')` instead of strings.
