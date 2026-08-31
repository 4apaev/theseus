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
- `src/main.js`     - `Projection extends Service` (no outbox) - consumer of the concrete event topics, NOT `events.all`;
                      `logEvents = true`, re-exports `createHandlers`
- `src/handlers.js` - dispatch map: one upsert per event type

------------------------------------------------------------------------------------------------

### migrations
- `001_players.sql`       : pid pk, handle, created
- `002_wallets.sql`       : pid pk, balance, updated
- `003_ships.sql`         : sid pk, pid, stid, status, from/to, years_abs/years_rel, timestamps
- `004_cargo.sql`         : (sid, gid) pk, quantity, updated
- `005_market_prices.sql` : (stid, gid) pk, price_buy, price_sell, updated
- `006_trade_history.sql` : tid pk, gid, pid, sid, stid, quantity, price_*, side, created
- `007_event_log.sql`     : eid pk, etype, payload jsonb, occurred, received - replay source for `scripts/rebuild.js`

full column detail in [migrations/](./migrations/), schema overview in [docs/phase.1.md](../../docs/phase.1.md)

------------------------------------------------------------------------------------------------

### notes

- **event ordering** - events are processed in order, but out of order delivery is possible.
  with FKs, a `wallet.created` arriving before `player.created` would violate a constraint
  even though the data is logically consistent.
- **rebuild / replay** (step 10) - `logEvents = true` makes `Service.start()` append every
  consumed event to `event_log` before dispatch. `npm run rebuild` truncates the 6 read-model
  tables in one statement (zero FKs between them, so no ordering to get right) and replays
  `event_log` ordered by `received, eid` through the exact same handler map - `event_log` only
  covers what's been consumed since the service last started with logging on, so a rebuild
  before then would silently discard history outside that window (see `docs/progress.md`,
  step 10).
- **source of truth is the write side** - referential integrity is enforced there
  (can't create a wallet for a non-existent player at command time).
- the projection just mirrors what already passed validation.
  indexes on reference columns (`pid`, `sid`, `stid`) are enough without the constraint overhead.

------------------------------------------------------------------------------------------------

### tests
- [ ] unit: handlers upsert per event type
- [x] integration: projection rebuild - `test/projection.rebuild.integration.spec.js`,
      full loop → snapshot 6 tables → rebuild → snapshot again → `assert.deepEqual` (step 10)
