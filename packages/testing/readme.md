🧪 testing
================================

- shared test helpers - fixtures and a fake kafka client


### deps:
- `@theseus/kafka`


### exports
- `src/fixtures.js`   - `fixtureIds` - stable ids for specs (`player_test`, `ship_test`, `sol.outpost`)
- `src/fake-kafka.js` - `createFakeKafka` - alias of `createMemoryKafka` from `@theseus/kafka`
