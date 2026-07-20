⛩️ gateway
================================

step `8` in [docs/phase.1.md](../../docs/phase.1.md)

- http api + websocket gateway - the game's only client-facing surface
- owns no write models - translates http → commands, reads projection read models
- issues JWT on login, validates locally - player-service not called at read time
- stateless: no schema, no migrations, no inbox/outbox - does NOT extend `@theseus/service`
- composes `createKafkaClient` + `createProducer` + `DB.create({ schema: 'projection' })` directly (like `scripts/smoke.js`)

### deps
- `garage`             - http server, router, middleware ([readme](https://github.com/4apaev/garage))
- `@theseus/kafka`     - producer + one event-feed subscription
- `@theseus/contracts` - command envelopes + validation (417 → http 400)
- `@theseus/auth`      - `sign` / `verify` / `create` - the JWT secret lives here only
- `@theseus/db`        - read-only pool into projection read models
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
| `ws.js`      | hand-rolled rfc 6455: frame codec, upgrade handshake, per-pid fanout     |

one kafka subscription (stable group `gateway`, the five concrete `events.*`
topics - `events.all` is never populated on a real broker) feeds both the
reply waiter and the websocket fanout.

### routes

| route              | auth | behavior                                                            |
|--------------------|------|---------------------------------------------------------------------|
| `POST /register`   |  -   | `player.register.requested` → waits for reply: 201 created, 409 taken, 202 `{cmd, correlation_id}` on timeout |
| `POST /login`      |  -   | `player.login.requested` → 200 `{token, pid, handle}`, 401 bad creds, 504 timeout |
| `POST /travel`     |  ✓   | `ship.travel.requested` → 202 `{cmd, correlation_id}`               |
| `POST /buy`        |  ✓   | `market.buy.requested` → 202                                        |
| `POST /sell`       |  ✓   | `market.sell.requested` → 202                                       |
| `GET /me`          |  ✓   | player + wallet (404 until projection catches up)                   |
| `GET /ships`       |  ✓   | player's ships with status / eta                                    |
| `GET /cargo/:sid`  |  ✓   | ship cargo (joins ships - own ships only)                           |
| `GET /market/:stid`|  ✓   | prices at station                                                   |
| `GET /trades`      |  ✓   | trade history, latest 100                                           |

- auth = `authorization: Bearer <jwt>`; `pid` always comes from the token
  claims, never from the body
- command payloads validate against `@theseus/contracts` before publish - 400 on invalid
- 202 responses carry `{ cmd, correlation_id }` - the eventual result arrives
  on the websocket with the same `correlation_id`

### websocket

- connect: `ws://host:3000/?token=<jwt>` - token checked before the 101
  (browsers cannot set headers on `WebSocket`; token-in-url is logged by
  proxies - acceptable here, `Sec-WebSocket-Protocol` smuggling is the alternative)
- push-only: one json text frame per event `{ event_type, correlation_id, occurred, payload }`
- events with `payload.pid` go to that player's sockets, `market.price.changed`
  broadcasts, client text frames are ignored
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
| `JWT_SECRET` `JWT_TTL`  | -       | token signing (`@theseus/auth`)   |

### tests

- `test/gateway.spec.js` - routes against a live garage app on port 0
  (memory kafka + fake pool + fake player service), ws frame codec,
  handshake, fanout filtering, heartbeat, reply waiter
- `test/gateway.integration.spec.js` - memory kafka + real pg: register →
  login → /me through the projection, travel command lands in kafka,
  ws pushes own events only
