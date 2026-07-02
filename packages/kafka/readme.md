📬 kafka
================================

- kafka client wrappers: producer, consumer with idempotency, record helpers
- `createMemoryKafka` - full in-memory broker for integration tests, no docker needed


### deps:
- `@theseus/util`


### exports
- `src/producer.js`    - `createProducer({ client })` → `{ publish }`
- `src/consumer.js`    - `createConsumer({ store, client, groupId, topics, handler })` → `{ stats, stop }`
- `src/idempotency.js` - `Store` - tracks processed message ids, backs consumer dedup
- `src/memory.js`      - `createMemoryKafka()` → `{ publish, subscribe, messages }` - subscribers called synchronously within `publish`
- `src/records.js`     - `createCommandRecord`, `createEventRecords`, `createTopicRecord`, `decodeTopicMessage`
- re-exports `Codec` / `encodeJson` / `decodeJson` from `@theseus/util`

------------------------------------------------------------------------------------------------

### consumer idempotency
- each message id checked against the store (`Inbox` from `@theseus/db` in services)
- seen → skip; unseen → handle + record, both inside the handler transaction
