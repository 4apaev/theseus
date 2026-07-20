permissions
================================================

design note, phase 1.5 - roles and visibility. status: **open, not started**.
what exists today is implicit: every authenticated player is equal, no admin.


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


open questions - decide before building
------------------------------------------------

1. **are other players visible beyond the trade feed?** handles + net
   worth for a leaderboard vs only what public transactions reveal.
   decides whether the projection needs a public-safe players view
   (handle yes, balance no).
2. **admin powers in phase 1** - read-only + rebuild (proposed) or also
   mutations through commands?
3. **admin bootstrap** - `ADMIN_HANDLES` env list (cheapest) vs a DB flag
   flipped by hand (most honest).

sequencing: the role plumbing is worth doing before the html client
(step 9) so the client can branch on `claims.role` from day one.
questions 1 and 2 change schemas - decide those first.
