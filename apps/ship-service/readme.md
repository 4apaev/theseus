🛸 ship-service
================================

- owns `ships` write model
- handles 1 command
- emits 3 event types
- travel timer is in-process `setTimeout` - doesn't survive restarts, acceptable for now


### deps:
- `@theseus/db`
- `@theseus/kafka`
- `@theseus/contracts`
- `@theseus/config`
- `@theseus/util`


### exports
- `src/main.js`     - pool → migrate → inbox → consumer(`commands.ship`) + `pollOutbox`
- `src/handlers.js` - dispatch map + travelRequested / arrive / reject
- `src/travel.js`   - distance/time math

------------------------------------------------------------------------------------------------

### migrations
- `001_ships.sql`
    ```sql
    create table ships (
        sid         text primary key,
        pid         text not null,
        stid        text not null,
        name        text not null,
        status      text not null default 'docked',
        "from"      text,
        "to"        text,
        capacity    integer not null,
        velocity    numeric not null,
        departs     timestamp,
        arrives     timestamp,
        arrived     timestamp,
        updated     timestamp,
        created     timestamp default now()
    )
    ```

------------------------------------------------------------------------------------------------

### travel math
- station distance map - hardcoded from constants
- years `years_abs = distance / velocity`
- years `years_rel = years_abs * sqrt(1 - velocity²)` - relativistic proper time
- `ms = abs * TIME_SCALE * 1000` - game milliseconds

------------------------------------------------------------------------------------------------

### handler: `ship.travel.requested.v1`
- fetch ship, reject if not found
- reject if not docked (`status !== 'docked'`)
- reject if ship not at `from` station (`stid !== from`)
- reject if `from === to`
- calculate travel time → `{ ms, arrives, years_abs, years_rel }`
- update ship: `status = 'transit'`, `departs = now`, `from`, `to`, `arrives`
- write to outbox → `ship.departed.v1` `{ sid, pid, from, to, departed, arrives, years_abs, years_rel }`
- `setTimeout(ms)` scheduled after commit (a rollback must not dock the ship) → transact:
  - update ship: `status='docked'`, `stid=to`, `arrived=now`
  - outbox → `ship.arrived.v1` `{ sid, pid, stid, arrived }`

------------------------------------------------------------------------------------------------

### idempotency
- inbox dedup on `cmd`

------------------------------------------------------------------------------------------------

### tests
- [x] unit: `test/ship.spec.js` - travel math, 4 rejections, departed payload, arrived after timeout (mock timers)
- [x] integration: `test/ship.integration.spec.js` - full travel flow, memory kafka + real postgres, `TIME_SCALE=0.1`

------------------------------------------------------------------------------------------------

### done when ship travels:

- `sol.outpost` → `alpha.exchange` in `~143s` game time (4.3 ly / 0.6c × 20 s/year)
- `departed` + `arrived` events flow through outbox.