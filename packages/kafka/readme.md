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
    - `createEmitter(producer)` - `(etype, e)` → outbox-ready event record; fills `eid` / `producer` / version defaults
    - `createCommander(producer)` - `(ctype, c)` → outbox-ready command record; fills `cmd` / `requested_by`
- re-exports `Codec` / `encodeJson` / `decodeJson` from `@theseus/util`

------------------------------------------------------------------------------------------------

### consumer idempotency
- each message id checked against the store (`Inbox` from `@theseus/db` in services)
- seen → skip; unseen → handle + record, both inside the handler transaction

------------------------------------------------------------------------------------------------

### real broker connection - not built yet

`createMemoryKafka` is the only client implementation; nothing ever calls
`start(client)` outside tests, and the compose broker has nobody talking to it.
the memory client already defines the adapter contract:

- `publish({ topic, messages: [{ key, value: Buffer }] })`
- `subscribe({ topics, groupId, handler })` → `{ stop }` - delivers raw
  `{ topic, key, value, offset, partition }`, decoding stays in `createConsumer`

plan (first task of step 7 - the gateway needs a real broker):

1. `src/client.js` - `createKafkaClient({ brokers, clientId })` backed by
   `kafkajs` (pure js, `producer.send` maps 1:1 onto our record shape,
   buffer values pass through). first non-workspace dep of this package.
2. runner - `runService(describe, start)` helper in `@theseus/config`:
   builds the client from `KAFKA_HOST` / `KAFKA_PORT`, logs the boot line,
   calls `start(client)` - so `node apps/<svc>/src/main.js` actually runs.
3. **events.all fanout gap** - outbox rows store one topic; `includeAll`
   never applies on the outbox path, so on a real broker the projection
   (subscribed to `events.all`) would hear *nothing*. fix: projection
   subscribes to the concrete event topics instead.
4. `stop()` must `disconnect()` real consumers; topic auto-create is on
   in compose, no provisioning step needed.
5. keep the first pass deliberately naive on rebalancing / `fromBeginning`
   / error handling.
