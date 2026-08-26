⛩️ gateway
================================

step `8` in [docs/phase.1.md](../../docs/phase.1.md)

- http api + websocket gateway - the game's only client-facing surface
- owns no write models - translates http → commands, reads projection read models
- issues JWT on login, validates locally - player-service not called at read time
- stateless: no schema, no migrations, no inbox/outbox - does NOT extend `@theseus/service`
- composes `createKafkaClient` + `createProducer` + `DB.create({ schema: 'projection' })` directly (like `scripts/smoke.js`)
- also serves the reference client - a top-level `client/index.html`, not
  nested here and not an npm package; see [docs/client.md](../../docs/client.md)

### deps
- `garage`             - http server, router, middleware ([readme](https://github.com/4apaev/garage))
- `@theseus/kafka`     - producer + one event-feed subscription
- `@theseus/contracts` - command envelopes + validation (417 → http 400)
- `@theseus/auth`      - `sign` / `verify` / `create` - the JWT secret lives here only
- `@theseus/db`        - read-only pool into projection read models
- `@theseus/domain`    - `universeData` - stations/routes/goods/starter/constants,
  fully composed there (incl. env-tunable `TIME_SCALE`/`INTEREST_RATE`/`STARTER_CREDITS`)
  and served as-is for `GET /universe`
- `garage/mw/ws`       - the rfc 6455 protocol (handshake, frames, keepalive);
  `feed.js` is the game-specific layer on top
- `@theseus/config`
- `@theseus/util`

------------------------------------------------------------------------------------------------

### layout

| file         | role                                                                     |
|--------------|--------------------------------------------------------------------------|
| `main.js`    | composition root - `start(client, opt)`, env boot via `run()`            |
| `routes.js`  | garage app: auth middleware, command routes, query routes                |
| `queries.js` | sql against `projection` tables                                          |
| `replies.js` | correlation waiter - register/login block until the reply event lands    |
| `feed.js`    | jwt-authenticated pid/price-broadcast fanout, built on `garage/mw/ws`    |

one kafka subscription (stable group `gateway`, the five concrete `events.*`
topics - `events.all` is never populated on a real broker) feeds both the
reply waiter and the websocket fanout.

### routes

| route              | auth  | behavior                                                            |
|--------------------|-------|---------------------------------------------------------------------|
| `GET /`            |  -    | the html client, `rs.file(clientPath)`                              |
| `GET /pub/:file(.*)` | -   | `clientPath`'s directory, served generically - css/js/img siblings, incl. the client's module graph |
| `GET /universe`    |  -    | stations / routes / goods / starter ship / constants, serialized once |
| `GET /garage/:file(.*)` | - | browser-safe `garage` source (util/sync/mime/constants/use), backs the client's import map |
| `POST /register`   |  -    | `player.register.requested` → waits for reply: 201 created, 409 taken, 202 `{cmd, correlation_id}` on timeout |
| `POST /login`      |  -    | `player.login.requested` → 200 `{token, pid, handle, role}`, 401 bad creds, 504 timeout |
| `POST /travel`     |  ✓    | `ship.travel.requested` → 202 `{cmd, correlation_id}`               |
| `POST /rename`     |  ✓    | `ship.rename.requested` → 202. the name rule lives in the contract, so a bad name is 400 |
| `POST /buy`        |  ✓    | `market.buy.requested` → 202                                        |
| `POST /sell`       |  ✓    | `market.sell.requested` → 202                                       |
| `GET /me`          |  ✓    | player + wallet (404 until projection catches up)                   |
| `GET /ships`       |  ✓    | player's ships with status / eta                                    |
| `GET /cargo/:sid`  |  ✓    | ship cargo (joins ships - own ships only)                           |
| `GET /market/:stid`|  ✓    | prices at station                                                   |
| `GET /trades`      |  ✓    | trade history, latest 100                                           |
| `GET /traffic`     |  ✓    | every ship, docked and in transit - by handle, never by pid         |
| `GET /station/:stid/ships` | ✓ | the ships docked at one station - the same query as `/traffic` |
| `GET /admin/players` | admin | all players + wallets                                             |
| `GET /admin/events`  | admin | projection `event_log`, latest 200                                |
| `GET /admin/inventory/:stid` | admin | station stock, from `market.station_inventory` directly - the source of truth, not the projection's quote mirror |
| `POST /admin/rebuild` | admin | truncate + replay projections (`scripts/rebuild.js`), 200 `{ replayed }` |

- auth = `authorization: Bearer <jwt>`; `pid` always comes from the token
  claims, never from the body
- admin = auth, plus `requireRole('admin')` - `claims.role !== 'admin'` → 403
- command payloads validate against `@theseus/contracts` before publish - 400 on invalid
- 202 responses carry `{ cmd, correlation_id }` - the eventual result arrives
  on the websocket with the same `correlation_id`
- role design: [docs/permissions.md](../../docs/permissions.md)

### websocket

- connect: `ws://host:3000/?token=<jwt>` - token checked before the 101
  (browsers cannot set headers on `WebSocket`; token-in-url is logged by
  proxies - acceptable here, `Sec-WebSocket-Protocol` smuggling is the alternative)
- push-only: one json text frame per event `{ event_type, correlation_id, occurred, payload }`
- events with `payload.pid` go to that player's sockets in full
- `ship.created` / `ship.departed` / `ship.arrived` / `ship.renamed` also go to every other
  socket, in a public shape - `sid` plus movement, no `pid`, no `years_rel`,
  no `correlation_id`. `ship.travel.rejected` stays private
- `market.price.changed` broadcasts, client text frames are ignored
- admin sockets (`claims.role === 'admin'`) skip the pid filter - full firehose
- the public shape is an allowlist (`PUBLIC` in `feed.js`). a new private
  field is dropped by default, not leaked
- ping/pong keepalive (30s), unanswered ping drops the socket
- backpressure is ignored (`socket.write` return unchecked) - a slow client
  buffers unboundedly; revisit if it ever matters
- single instance only: a second gateway in the same consumer group would
  partition the fanout between them

probe it: `node --env-file=./.env scripts/ws-probe.js <token>`

### env

| var                     | default | what                              |
|-------------------------|---------|-----------------------------------|
| `GATEWAY_PORT`          | 3000    | http + ws port                    |
| `GATEWAY_REPLY_TIMEOUT` | 5s      | register/login reply wait (must exceed the ~1s outbox poll) |
| `GATEWAY_CLIENT_PATH`   | `./client/index.html` | served by `GET /`, cwd-relative - every documented boot command runs from repo root |
| `JWT_SECRET` `JWT_TTL`  | -       | token signing (`@theseus/auth`)   |

### tests

- `test/gateway.spec.js` - routes against a live garage app on port 0
  (memory kafka + fake pool + fake player service): `GET /` `/universe`
  (public, no bearer), `feed.js`'s jwt/pid fanout, reply waiter, the 4
  admin routes + `requireRole` 403, admin ws firehose. rfc 6455 protocol
  mechanics (frame codec, handshake, keepalive) are `garage/mw/ws`'s own
  job - tested in the garage repo, not here
- `test/gateway.integration.spec.js` - memory kafka + real pg: register →
  login → /me through the projection, travel command lands in kafka,
  ws pushes own events only
