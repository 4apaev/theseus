🪏 util
================================

### shared utilities:
- `garage` re-exports
- json codec
- string helpers
- polling
- sql builders
- errors


### deps:
- `garage`


### exports
- `src/index.js`
    - codec   : `encodeJson` / `decodeJson` / `Codec` - buffer ↔ json
    - string  : `Raw`, `up`, `low`, `trim`, `camel2snake`
    - time    : `formatTime('5s' | '2m' | '1h' | '3d' | '1w')` → ms
    - polling : `poll(fx, ms)` → `{ result, stop }` - self-rescheduling timeout loop
    - db      : `withClient(pool, fx)`, `Query(pool)` tagged-template sql, `where` / `selectWhere` builders
- `src/errors.js`
    - `Chaos` - base error: `is` / `of` / `from` / `raise` / `deny` / `ok` / `no` static helpers
    - `DBChaos`, `KafkaChaos` - tagged subclasses
    - `HttpChaos` - status-coded error, coerces to number (`+err` → status code)
