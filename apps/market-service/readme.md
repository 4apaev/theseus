🎰 market-service
================================

step `6` done - see [docs/phase.1.md](../../docs/phase.1.md), tracked in [docs/progress.md](../../docs/progress.md)

- owns `markets`, `station_inventory`, `cargo`, `trades` write models in pg schema `market`
- handles 2 commands + 5 events (wallet continuation, ships mirror)
- orchestrates buy + sell sagas - the only cross-service hop is the wallet
- emits `market.trade.executed.v1` / `market.trade.rejected.v1` / `market.price.changed.v1`
  / `cargo.loaded.v1` / `cargo.unloaded.v1`


### deps:
- `@theseus/db`
- `@theseus/kafka`
- `@theseus/contracts`
- `@theseus/config`
- `@theseus/domain` - universe profiles, `price` / `spread`, `makeId`
- `@theseus/util`


### exports
- `src/main.js`     - pool → migrate → seed → inbox → consumer(`commands.market`, `events.wallet`, `events.ship`) + `pollOutbox`
- `src/handlers.js` - ships mirror + buy / sell sagas + continuation / compensation
- `src/seed.js`     - `seed(pool, transact)` fills empty markets, `quote(gid, stock, target)`

------------------------------------------------------------------------------------------------

### migrations
- `001_markets.sql`           : (`stid`, `gid`) pk, `price_buy`, `price_sell` - quote board,
                                written on every stock change, never read by the sagas
- `002_station_inventory.sql` : (`stid`, `gid`) pk, `stock`, `target` - source of truth,
                                sagas `select … for update` here
- `003_ships.sql`             : `sid` pk, `pid`, `stid`, `status`, `capacity` - mirror from `events.ship`
- `004_cargo.sql`             : (`sid`, `gid`) pk, `quantity`
- `005_trades.sql`            : `tid` pk, saga state - `pending` → `executed` | `rejected`

------------------------------------------------------------------------------------------------

### the locked stock

every trade starts by locking its `station:good` inventory row and computing
the price from the very stock it is about to change:

- concurrent trades on the same row serialize - no double-spent stock
- the quote can't drift - there is no second copy to fall out of sync
- stock move + `pending` trade + outboxed wallet command commit atomically
- `price_unit_max` / `price_unit_min` are the player's guard against
  a quote moving between look and buy

------------------------------------------------------------------------------------------------

### buy saga
- `market.buy.requested.v1` → reject when: unknown market, ship unknown / not docked
  here, insufficient stock, over capacity, price above limit → `market.trade.rejected.v1`
- reserve: `stock -= quantity`, insert trade `pending`, outbox → `wallet.debit.requested.v1`
  (`rfid = tid`, via kafka's `createCommander`)
- on `wallet.debited.v1` (matched by `rfid`): cargo upsert, trade `executed`,
  outbox → `cargo.loaded.v1` + `market.trade.executed.v1` + `market.price.changed.v1`
- on `wallet.transaction.rejected.v1`: release stock, trade `rejected`, outbox → `market.trade.rejected.v1`

### sell saga
mirror of buy: hand over cargo → `wallet.credit.requested.v1` →
on `wallet.credited.v1` station restocks, quote republished;
wallet rejection returns the cargo.

### pricing
- seed derives stock from universe economy profiles (producer surplus 160,
  consumer scarcity 40, target 100) and publishes the first quotes -
  the step 5 deferred item
- every settle republishes `spread(price(base, stock, target, elasticity))`
  from fresh stock - markets breathe as players trade

### idempotency
- inbox dedup on `cmd` / `eid`
- `tid` rides as `rfid` - wallet retries are no-ops on the player side
- wallet events with no pending trade are ignored (not ours)

------------------------------------------------------------------------------------------------

### tests
- [x] unit: `test/market.spec.js` - 21 tests: quotes, seed, every rejection reason,
      reserve, settle, compensation, side mismatch, ships mirror
- [x] integration: `test/market.integration.spec.js` - seed → buy → debit command
      on `commands.wallet` → settle on `wallet.debited` → stock / cargo / trade rows
- [x] integration: `test/game.integration.spec.js` - **the full loop** with player +
      ship + market: register → buy ore at `sol.outpost` → fly to `barnards.port` →
      sell → trader ends richer than ₡1000
