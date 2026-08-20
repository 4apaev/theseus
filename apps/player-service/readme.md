🎮 player-service
================================

- owns `players`, `wallets`, `wallet_transactions` write models
- handles 3 commands
- emits 6 event types
- all writes go through outbox in the same transaction


### deps:
- `@theseus/db`
- `@theseus/kafka`
- `@theseus/contracts`
- `@theseus/config`
- `@theseus/util`


### exports
- `src/main.js`     - `Player extends Service` - consumer(`commands.player`, `commands.wallet`)
- `src/handlers.js` - dispatch map: register / debit / credit
- `src/crypto.js`   - `hash` / `verify` - scrypt, no pg extension, hash before it hits the DB

------------------------------------------------------------------------------------------------

### migrations
- `001_players.sql`
    ```sql
    create table players (
        pid         text      primary key,
        handle      text      not null unique,
        hash        text      not null,
        created     timestamp default now()
    )
    ```
- `002_wallets.sql`
    ```sql
    create table wallets (
        pid         text    primary key,
        balance     numeric not null default 0,
        version     integer not null default 1
    )
    ```
- `003_wallet_transactions.sql`
    ```sql
    create table wallet_transactions (
        rfid        text primary key,
        pid         text not null,
        type        text not null,
        amount      numeric not null,
        created     timestamp default now()
    )
    ```
- `004_players_role.sql`
    ```sql
    alter table players add column role text not null default 'player'
    ```

------------------------------------------------------------------------------------------------

### consumes
- `player.register.requested.v1` → `player.created.v1` + `wallet.created.v1` | `player.registration.rejected.v1`
- `wallet.debit.requested.v1`    → `wallet.debited.v1`  | `wallet.transaction.rejected.v1`
- `wallet.credit.requested.v1`   → `wallet.credited.v1` | `wallet.transaction.rejected.v1`

------------------------------------------------------------------------------------------------

### role (phase 2 step 2.2)
- `players.role`, default `'player'`
- `player.login.requested.v1` checks `ADMIN_HANDLES` (comma-separated env
  allowlist) on every login. a match promotes to `role = 'admin'`,
  persisted. no match never demotes - an env change alone can't strip an
  existing admin
- `role` rides in `player.login.succeeded.v1`'s payload - the gateway
  signs it into the JWT from there. design: [permissions.md](../../docs/permissions.md)

------------------------------------------------------------------------------------------------

### idempotency
- inbox dedup on `cmd`
- `wallet_transactions.rfid` claim - duplicate debit/credit skips silently

------------------------------------------------------------------------------------------------

### tests
- [x] unit: `test/player.spec.js` - register, duplicate handle, debit, insufficient funds, credit, duplicate rfid
- [x] integration: `test/player.integration.spec.js` - full flow with memory kafka + real postgres
