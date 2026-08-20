permissions
================================================

design note, [phase 2](phase.2.md) step 2.2 - roles and visibility.
status: **done ✔** - see [progress.md](progress.md).


what is already enforced
------------------------------------------------

| rule                        | where                                                     |
|-----------------------------|-----------------------------------------------------------|
| identity                    | JWT `{ pid, handle }` signed by gateway at login          |
| commands act as yourself    | `pid` always from token claims, body pid ignored          |
| own wallet / trades only    | `/me` `/trades` filter by token pid                       |
| own ships only              | `/ships` filters by pid                                   |
| own cargo only              | `/cargo/:sid` joins ships - foreign sid reads as empty    |
| market prices public-ish    | `/market/:stid` visible to any authenticated player       |
| ws privacy                  | events filtered by `payload.pid`, prices broadcast        |

player-vs-player privacy is mostly done. missing: a **role axis** and a
decision about which game data is public.


proposed model
------------------------------------------------

three visibility tiers:

- **public**    - any authenticated player: market prices, universe graph, station
                  info, ship traffic (transponder on), station trade feed
- **owner**     - wallet, cargo, own ships' detail, transponder state
- **admin**     - everything: all players, event log, station inventory, rebuild,
                  ships running dark

### role plumbing (cheap, fits the architecture)

1. `players.role` column, default `'player'` - player-service owns identity
2. `player.login.succeeded.v1` payload gains `role` - the login reply is
   already how identity facts reach the gateway; role rides along into
   the JWT claims
3. gateway `requireRole('admin')` middleware next to `auth` in the garage chain
4. role-aware ws fanout - admin sockets skip the pid filter, see the
   full firehose (live debugging tool for free)

consequence: role is baked into the token - promotion/demotion takes
effect at next login. fine at 7d ttl; revocation would need a denylist
we don't want yet.

### admin surface (phase 1: read-only + rebuild)

- `GET  /admin/players` - all players + wallets
- `GET  /admin/events`  - projection `event_log`, currently written and never read
- `GET  /admin/inventory/:stid` - station stock (market schema source of truth)
- `POST /admin/rebuild` - truncate + replay projections - **this is step 10**,
  it gets a natural home here

mutating admin ops (credit a wallet, restock a station) go through the
existing commands later - `requested_by` is the audit trail.

### admin bootstrap

`ADMIN_HANDLES` env var, a comma-separated list of handles. player-service
checks it at `login.succeeded` time and sets `role = 'admin'` for a match.
same pattern as `STARTER_CREDITS` / `TIME_SCALE` / `INTEREST_RATE` - no
schema change, no db flag.


decided
------------------------------------------------

- **ship traffic is public by default** - who's docked / in transit is
  visible to everyone: `/station/:stid/ships` can exist, the client can
  render port traffic
- **market transactions are public by default** - the trade feed at a
  station is open, not just the quotes
- **future mechanic: hide ship movement** - a player can switch off the
  ship's transponder to drop out of the public traffic feed. visibility
  becomes per-ship state (`transponder: on|off`), not a permission tier -
  the read side filters on it, admin still sees everything. gameplay
  hooks later: running dark could cost something or carry risk

  _note_: player must be with transponder on, to dock at any station.
  wich means - transponder can be switched off only in transit, not when docking.
- **other players are visible by handle only** - a public-safe players
  view (handle, no balance). net worth stays private, matching the
  "owner: wallet" tier above. a net-worth leaderboard stays an idea, not
  scheduled.
- **admin powers, phase 1, are read-only + rebuild** - the 4 routes
  above. mutating admin ops wait for a later phase.
- **admin bootstrap is an env allowlist** - `ADMIN_HANDLES`, above.

nothing blocks the build now.
