🧪 testing
================================

- shared test helpers - fixtures, fake kafka client, unit mocks, integration harness


### deps:
- `@theseus/kafka`
- `@theseus/contracts`


### exports
- `src/fixtures.js`    - `fixtureIds` - stable ids for specs (`player_test`, `ship_test`, `sol.outpost`)
- `src/fake-kafka.js`  - `createFakeKafka` - alias of `createMemoryKafka` from `@theseus/kafka`
- `src/mocks.js`       - unit-test doubles, no io
    - `fakeClient(overrides)`           - pg client stub, logs queries, `overrides` match by sql substring
    - `fakePool(overrides)`             - pool wrapping a `fakeClient`
    - `fakeTransact(client)`            - transact stand-in, runs `fn(client)` directly
    - `outboxEvents(client)`            - parsed event envelopes from logged outbox inserts
    - `makeCmd(payload, extra)`         - command envelope stub (`cmd-test` / `corr-test`)
- `src/integration.js` - live harness for `test/*.integration.spec.js`
    - `waitFor(fx, ms, interval)`       - poll until truthy, throw on timeout
    - `guid(prfx)`                      - `<prfx><short-uuid>` test ids
    - `createPublisher(producer)`       - `(type, payload)` → publish command envelope
    - `collectEvents(kafka, topics)`    - `{ events, stop }` - decoded event collector

------------------------------------------------

### spec title banner
importing `src/index.js` logs a `── {title} ──…` banner, one per import url:

```js
import { fakeClient } from '../packages/testing/src/index.js?title=🧪 🛸 SHIP'
```

no `?title=` → falls back to the spec path from `process.argv`.
esm caches by full url, so each distinct title prints once.
