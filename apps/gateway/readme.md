⛩️ gateway
================================

step `7` in [docs/progress.p.md](../../docs/progress.p.md)

- http api + websocket gateway
- owns no write models - translates http → commands, reads from projection read models
- issues JWT on login, validates locally - player-service not called at read time


### deps (to add):
- `@theseus/kafka`     - producer only, no consumer group
- `@theseus/contracts` - command envelopes + validation
- `@theseus/config`
- `@theseus/auth`      - new package: `signJwt` / `verifyJwt` (see decisions log)
- `@theseus/db`        - read-only pool into projection read models
- `@theseus/util`

------------------------------------------------------------------------------------------------

### plan

#### scaffold
- [ ] deps in `package.json`
- [ ] `src/main.js`   - http server + kafka producer + read pool
- [ ] `src/routes.js` - route table → command mapping
- [ ] `src/ws.js`     - websocket: push events to connected players
- [ ] `packages/auth` - `signJwt` / `verifyJwt`, JWT secret stays out of player-service

#### auth
- [ ] `POST /register` → `player.register.requested.v1`, poll projection for `player.created`
- [ ] `POST /login`    → verify against player-service (query or rpc-style command), issue JWT
- [ ] middleware: `verifyJwt` locally on every request, `pid` from token claims

#### commands (write side)
- [ ] `POST /travel` → `ship.travel.requested.v1`
- [ ] `POST /buy`    → `market.buy.requested.v1`
- [ ] `POST /sell`   → `market.sell.requested.v1`
- [ ] validate payload with `@theseus/contracts` before publish, 400 on invalid
- [ ] respond `202 { cmd, correlation_id }` - result arrives via websocket / polling

#### queries (read side - projection tables)
- [ ] `GET /me`               - player + wallet
- [ ] `GET /ships`            - player's ships with status / eta
- [ ] `GET /cargo/:sid`       - ship cargo
- [ ] `GET /market/:stid`     - prices at station
- [ ] `GET /trades`           - trade history

#### websocket
- [ ] consumer(`events.all`) filtered by `pid` → push to connected sockets
- [ ] correlate command responses by `correlation_id`

#### tests
- [ ] unit: route → command mapping, payload validation, auth middleware
- [ ] integration: register → login → travel command lands in kafka
