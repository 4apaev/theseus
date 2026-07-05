🎰 market-service
================================

step `6` in [docs/phase.1.md](../../docs/phase.1.md) - current step, tracked in [docs/progress.md](../../docs/progress.md)

- owns `markets`, `station_inventory`, `trades` write models
- orchestrates buy + sell sagas across wallet (player-service) and cargo
- emits `trade.executed.v1` / `trade.rejected.v1` / `market.price.changed.v1`


### deps:
- `@theseus/db`
- `@theseus/kafka`
- `@theseus/contracts`
- `@theseus/config`
- `@theseus/domain` - `capitalCost` for interest-adjusted pricing
- `@theseus/util`


plan
--------------------------------

### scaffold
- [ ] deps in `package.json`
- [ ] `src/main.js`     - pool → migrate → inbox → consumer(`commands.market`, `commands.cargo`, `events.wallet`) + `pollOutbox`
- [ ] `src/handlers.js` - dispatch map: buy / sell / cargo load / unload + saga continuation on wallet events
- [ ] `src/saga.js`     - trade saga state machine

### migrations
- [ ] `001_markets.sql`           : (`stid`, `gid`) pk, `price_buy`, `price_sell`, `updated`
- [ ] `002_station_inventory.sql` : (`stid`, `gid`) pk, `quantity`, `updated`
- [ ] `003_cargo.sql`             : (`sid`, `gid`) pk, `quantity`, `updated`
- [ ] `004_trades.sql`            : `tid` pk, saga state (`pending` / `debited` / `executed` / `rejected`), payload, `created`, `updated`

### buy saga
- [ ] `market.buy.requested.v1` → validate: ship docked at station, stock available, cargo capacity
- [ ] reserve stock + insert trade `pending`, outbox → `wallet.debit.requested.v1` (rfid = tid)
- [ ] on `wallet.debited.v1`    → load cargo, mark trade `executed`, outbox → `cargo.loaded.v1` + `trade.executed.v1`
- [ ] on `wallet.transaction.rejected.v1` → release stock, mark trade `rejected`, outbox → `trade.rejected.v1`

### sell saga
- [ ] `market.sell.requested.v1` → validate: ship docked, cargo quantity available
- [ ] unload cargo + insert trade `pending`, outbox → `wallet.credit.requested.v1` (rfid = tid)
- [ ] on `wallet.credited.v1` → restock station, outbox → `cargo.unloaded.v1` + `trade.executed.v1`

### pricing
- [ ] `market.price.changed.v1` on stock change or periodic drift
- [ ] interest-adjusted goods pricing - `capitalCost(principal, INTEREST_RATE, years_abs)` per Krugman

### idempotency
- [ ] inbox dedup on `cmd` / `eid`
- [ ] `tid` as `rfid` for wallet commands - retries are no-ops on the wallet side

### tests
- [ ] unit: buy rejected (not docked, no stock, no capacity, insufficient funds)
- [ ] unit: sell rejected (not docked, no cargo)
- [ ] unit: saga compensation - stock released on wallet rejection
- [ ] integration: full buy → debit → cargo → trade.executed flow
