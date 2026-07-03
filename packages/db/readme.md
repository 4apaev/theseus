📇 db
================================

- postgres pool, transactions, migrations
- inbox / outbox tables shared by every service
- each service runs these migrations + its own `migrations/` dir

### deps:
- `pg`
- `@theseus/util`


### exports
- `src/pool.js`    - `DB.create({ schema })` (pool from env, `search_path` per service), `DB.transact(pool, fx)` - begin / commit / rollback
- `src/inbox.js`   - `Inbox.create(pool)` (pg-backed dedup), `Inbox.memory()` (Set-backed, for tests)
- `src/outbox.js`  - `Outbox.write(client, records)` in-transaction, `Outbox.poll(pool, publish)` - 1s polling loop, returns `{ stop }`
- `src/migrate.js` - `migrate(pool)` runs shared migrations, `migrate(pool, dir)` runs service-specific ones

------------------------------------------------

### migrations
- `001_inbox.sql`
    ```sql
    create table inbox (
        eid         text primary key,
        created     timestamp default now()
    )
    ```
- `002_outbox.sql`
    ```sql
    create table outbox (
        id          text primary key,
        topic       text not null,
        key         text,
        payload     jsonb not null,
        created     timestamp default now(),
        published   timestamp
    )
    ```

------------------------------------------------

### outbox pattern
- domain write + `Outbox.write` in the same transaction - atomic
- polling loop reads unpublished rows, publishes to kafka, marks `published`
- at-least-once delivery - consumers dedup via inbox

### schema per service
- `DB.create({ schema })` sets `search_path` on every pool connection
- `migrate` runs `create schema if not exists` first
- each service gets its own tables, inbox/outbox and `schema_migrations` -
  same table or migration names across services never collide
- tests peek with the same schema: `DB.create({ schema: 'player' })`
