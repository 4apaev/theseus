🛸 ship-service
================================

- owns `ships` write model in pg schema `ship`
- handles 1 command + 1 event (`player.created` → starter ship saga)
- emits 4 event types
- travel arrival is a durable postgres poll, survives restarts
- step 4 done - scaffold, handler, migrations, tests all in place


### deps:
- `@theseus/db`
- `@theseus/kafka`
- `@theseus/contracts`
- `@theseus/config`
- `@theseus/domain` - `universe` graph, `starterShip`
- `@theseus/util`


### exports
- `src/main.js`     - `Ship extends Service` - consumer(`commands.ship`, `events.player`),
                      overrides `start()`/`stop()` to own the arrivals poller's lifecycle
- `src/handlers.js` - dispatch map + playerCreated / travelRequested / reject
- `src/arrivals.js` - `pollArrivals(pool, transact, opts)` - claims + docks due ships
- `src/travel.js`   - distance/time math, `distance()` delegates to `universe`

------------------------------------------------------------------------------------------------

### rename

`ship.rename.requested.v1` → `ship.renamed.v1` | `ship.rename.rejected.v1`

the `UPDATE` is scoped by `sid` **and** `pid`. a player who aims at
another player's ship matches no row, and gets a rejection. ownership
needs no separate read.

the name rule is `field.shipName` in the contract: 1-24 characters,
letters, digits, space, and `- ' .` only, with no padding. the gateway
answers 400 before the command reaches kafka. a ship name appears on
other players' screens, so `esc()` still guards every render.

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
- `002_ships_correlation.sql` - adds `causation_id`, `correlation_id` (nullable text) -
  persisted for the duration of a trip so a restart-recovered arrival can still correlate
  `ship.arrived` back to the original travel command
- `003_ships_manifest.sql` - adds `manifest text[] not null default '{}'` - the stops still
  to come after the leg in flight (`"to"`). a direct hop leaves it empty.

------------------------------------------------------------------------------------------------

### travel math
- station distance map - hardcoded from constants, keys normalized to sorted
  order at init so routes can be listed either way
- years `years_abs = distance / velocity`
- years `years_rel = years_abs * sqrt(1 - velocity²)` - relativistic proper time
- `ms = abs * TIME_SCALE * 1000` - game milliseconds

------------------------------------------------------------------------------------------------

### saga: `player.created.v1` → starter ship
- every new player gets `starterShip` from `@theseus/domain` -
  docked at `sol.outpost`, 0.6c, capacity 20
- the name comes from `randomShipName()`, not `starterShip.name` -
  a fresh Culture-esque name each time, not the same fixed one
- insert into `ships` + outbox → `ship.created.v1` in one transaction
- ownership stays here - only ship-service writes ships; projection mirrors the event

------------------------------------------------------------------------------------------------

### handler: `ship.travel.requested.v1`
- fetch ship, reject if not found
- reject if not docked (`status !== 'docked'`)
- reject if ship not at `from` station (`stid !== from`)
- reject if `from === to`
- `to` is the final destination, not necessarily a neighbor - `universe.path(from, to,
  velocity)` resolves the full hop sequence; reject with `'no route to destination'` if
  nothing connects them
- the first hop becomes `"to"`, the rest becomes `manifest` - `arrivals.js` consumes it
  one hop at a time
- calculate the first leg's travel time → `{ arrives, years_abs, years_rel }`
- update ship: `status = 'transit'`, `departs = now`, `from`, `to`, `arrives`, `manifest`,
  `causation_id`, `correlation_id`
- write to outbox → `ship.departed.v1` `{ sid, pid, from, to, departed, arrives, years_abs, years_rel }`
  - `to` is the first hop here too, same payload shape as a direct trip
- no in-process timer is scheduled - `arrivals.js`'s poll picks it up whenever it comes due

------------------------------------------------------------------------------------------------

### arrivals - `pollArrivals(pool, transact, { interval })`
- wraps `@theseus/util`'s `poll()` (the same primitive `packages/db`'s outbox poller uses) -
  state lives entirely in the `ships` row, not in memory, so a restart needs no recovery step:
  the next tick just finds the same overdue rows a dedicated recovery pass would have
- one atomic statement per tick, not select-then-update:
  `update ships set status='docked', stid="to", arrived=arrives where status='transit'
  and arrives <= now() returning ...` - claims every due ship in one go, and postgres row
  locking means two overlapping pollers (e.g. mid-deploy) can't double-claim the same row
- `arrived = arrives` docks at the scheduled instant, not whatever wall-clock moment the
  poll happened to run
- emits `ship.arrived.v1` `{ sid, pid, stid, arrived }` per claimed ship, correlated via the
  `causation_id`/`correlation_id` persisted at departure
- a claimed ship with a non-empty `manifest` isn't done - it was only a waypoint.
  `advanceManifest()` re-departs it toward the next hop in the same transaction: pops the
  next stop, runs `travel()` for that leg, writes `status` back to `'transit'` with the new
  `from`/`to`/`arrives`/`manifest`, and emits `ship.departed.v1` - a normal re-departure, not
  a new event shape. the ship briefly touches `docked` inside the transaction, but nothing
  outside it ever sees that state - both writes commit together.
- `Ship.start()` starts it after `super.start()`, `Ship.stop()` stops it before `super.stop()`;
  interval via `SHIP_ARRIVAL_INTERVAL` (default 1000ms, `.env.dev` sets 25ms for tests)

------------------------------------------------------------------------------------------------

### idempotency
- inbox dedup on `cmd`
- arrivals poll is idempotent by construction - `where status = 'transit'` means a ship
  already docked is never claimed twice

------------------------------------------------------------------------------------------------

### tests
- [x] unit: `test/ship.spec.js` - travel math, 5 rejections, departed payload
      (incl. persisted causation/correlation), a multi-hop destination resolving to a
      manifest, `pollArrivals` claims a due ship / advances one with a manifest / leaves a
      not-yet-due one alone / `stop()` halts polling, starter ship saga
- [x] integration: `test/ship.integration.spec.js` - full travel flow + player.created → starter
      ship flies + a multi-hop destination steps through each waypoint on its own, memory
      kafka + real postgres, `TIME_SCALE=0.1`, `SHIP_ARRIVAL_INTERVAL=25`
- [x] verified live: real broker + real postgres, killed ship-service mid-transit
      (`bash scripts/reboot.sh ship`), confirmed the row survived untouched and the fresh
      process's first poll tick docked it and published `ship.arrived.v1` - the scenario
      that was actually broken before this, with no automated test for "process died and
      came back" specifically

------------------------------------------------------------------------------------------------

### done when ship travels:

- `sol.outpost` → `alpha.exchange` in `~144s` game time (4.32 ly / 0.6c × 20 s/year)
- `departed` + `arrived` events flow through outbox.
- surviving a restart mid-transit: confirmed live.