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

### real broker connection

`src/client.js` - `createKafkaClient({ brokers, clientId })` backed by `kafkajs`
(the package's first non-workspace dep). same contract the memory client defines:

- `publish({ topic, messages: [{ key, value: Buffer }] })` → `{ count, topic }` -
  one lazily-connected producer shared by all publishes
- `subscribe({ topics, groupId, handler })` → `{ stop }` - sub returned
  synchronously, connect chain settles in the background; delivers raw
  `{ topic, key, value, offset, partition }`, decoding stays in `createConsumer`
- `stop()` disconnects the producer and every consumer

hard-won details:

- **topics are ensured before subscribing** - fresh brokers auto-create on
  *produce*, not subscribe; a consumer of a never-produced topic dies with
  `UNKNOWN_TOPIC_OR_PARTITION`. `createTopics` runs serialized per client -
  parallel calls race each other on a fresh broker.
- **subscribe retries** (5 × backoff) - metadata propagation and
  "group coordinator not available" are transient on a cold broker.
- `fromBeginning: true` - first boot processes the backlog, inbox dedup
  makes replays safe; later boots resume from committed group offsets.
- deliberately naive on rebalancing beyond kafkajs defaults.

the runner lives in [`@theseus/service`](../service/readme.md) - `Kind.run()`
builds the client from `KAFKA_HOST` / `KAFKA_PORT`, so
`node apps/<svc>/src/main.js` boots a real service. the **events.all fanout
gap** is fixed on the consumer side: projection subscribes to the concrete
event topics. acceptance: `npm run infra:up && npm run smoke`.
