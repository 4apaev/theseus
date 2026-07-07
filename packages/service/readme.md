🎖️ service
================

- the shared service lifecycle every `main.js` used to copy:
  pool → migrate → seed → producer → inbox → outbox → consumer
- subclass sets the static fields, provides `handlers()`,
  optionally overrides `seed()`; deps arrive via the constructor


### deps:
- `@theseus/config`
- `@theseus/db`
- `@theseus/kafka`
- `@theseus/util`


### exports
- `src/index.js` - `Service` (default)
    - statics: `service` / `schema` / `topics` / `migrations` (URL) /
      `outbox` (false for consume-only) / `role` / `owns`
    - `handlers()` - subclass returns the dispatch map, keyed by
      `command_type ?? event_type`
    - `seed()` - optional startup hook (market fills its economy here)
    - `start()` / `stop()` / `stats()` / `static describe()`
    - `static of(input)` - construct with `{ client, pool? }` injected
    - `static run()` - composition root: boot log, real
      `createKafkaClient` from `KAFKA_HOST` / `KAFKA_PORT`,
      `SIGINT` / `SIGTERM` shutdown

--------------------------------

### a service in full

```js
import Service from '@theseus/service'

export class Market extends Service {
    static schema     = 'market'
    static service    = 'market-service'
    static migrations = new URL('../migrations', import.meta.url)
    static topics     = [ commandTopics.market, eventTopics.wallet ]

    handlers() { return createHandlers(this.pool, DB.transact) }
}

isMain(import.meta.url) && Market.run()          // real broker
new Market({ client: createMemoryKafka() })      // tests
```
