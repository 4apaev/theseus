📺 projection-service
================================

- first running service
- disposable read models - can be rebuilt from scratch by replaying events
- builds read models from all events (`events.*`)
- gives live visibility
- validates the event structure early
- consume only - inbox for dedup, no outbox


### deps:
- `@theseus/db`
- `@theseus/kafka`
- `@theseus/contracts`
- `@theseus/config`
- `@theseus/util`


### exports
- `src/main.js`     - pool → migrate → inbox → consumer(`events.all`)
- `src/handlers.js` - dispatch map: one upsert per event type

------------------------------------------------------------------------------------------------

### migrations
- `001_players.sql`       : pid pk, handle, created
- `002_wallets.sql`       : pid pk, balance, updated
- `003_ships.sql`         : sid pk, pid, stid, status, from/to, years_abs/years_rel, timestamps
- `004_cargo.sql`         : (sid, gid) pk, quantity, updated
- `005_market_prices.sql` : (stid, gid) pk, price_buy, price_sell, updated
- `006_trade_history.sql` : tid pk, gid, pid, sid, stid, quantity, price_*, side, created

full column detail in [migrations/](./migrations/), schema overview in [docs/phase.1.md](../../docs/phase.1.md)

------------------------------------------------------------------------------------------------

### notes

- **event ordering** - events are processed in order, but out of order delivery is possible.
  with FKs, a `wallet.created` arriving before `player.created` would violate a constraint
  even though the data is logically consistent.
- **rebuild / replay** - truncate + replay would force careful table ordering during truncation.
- **source of truth is the write side** - referential integrity is enforced there
  (can't create a wallet for a non-existent player at command time).
- the projection just mirrors what already passed validation.
  indexes on reference columns (`pid`, `sid`, `stid`) are enough without the constraint overhead.

------------------------------------------------------------------------------------------------

### tests
- [ ] unit: handlers upsert per event type
- [ ] integration: projection rebuild - truncate + replay (step 9)
