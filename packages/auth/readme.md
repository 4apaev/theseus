🔐 auth
================================

- gateway's token primitives - `sign` / `verify`, hand-rolled HS256
- the JWT secret lives here, not in player-service - `player/src/crypto.js`
  owns credential ops (`hash`/`verify`), this package owns tokens.
  keeping them apart means a compromised player-service never leaks the
  secret that signs every session.

### deps:
- `@theseus/util` - `Fail`, `formatTime`

### exports
- `src/index.js`
    - `sign(payload, secret, ttl = '7d')` → token string,
      `ttl` accepts `formatTime` strings (`'7d'`, `'1h'`, ms number)
    - `verify(token, secret)` → claims, throws on failure
    - `createAuth(secret, ttl)` → `{ sign, verify }` - secret bound once,
      same factory shape as kafka's `createEmitter` / `createCommander`

------------------------------------------------

### verify throws

| condition                     | code | message          |
|-------------------------------|------|------------------|
| missing/extra token segments  | 401  | malformed token  |
| signature doesn't match       | 401  | bad signature    |
| body isn't valid json         | 401  | malformed token  |
| `exp` has passed              | 401  | token expired    |

gateway middleware catches once, maps to HTTP 401.
