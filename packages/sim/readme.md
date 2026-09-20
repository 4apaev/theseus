@theseus/sim
================================================

- the load and data run, and the harness under it
- players are pluggable: a module exports `turn(player, peers, stats)`
- nothing here is a service - no schema, no kafka, no inbox/outbox

see [docs/sim.md](../../docs/sim.md) for the agent plan and the token
costs, and [scripts/readme.md](../../scripts/readme.md) for the flags.


### files

| file | role |
|------|------|
| `run.js` | tempo, retune, the tick loop. `run(opt, brain)` |
| `player.js` | one player's transport: http through Sync, the websocket feed, pending commands |
| `players/dice.js` | the weighted random brain |
| `stats.js` | every request, every command outcome |
| `analytics.js` | read models over the event log and `market.trades` |
| `invariants.js` | 10 rules as sql over final state |
| `report.js` | stdout, json, and the html page |
| `cleanup.js` | sweeps a run's players out of the database |


### where the output goes

| path | holds | ignored |
|------|-------|---------|
| `.reports/sim-<seed>.json` | every number the run produced, for diffing runs | yes |
| `.reports/sim-<seed>.html` | the same numbers as a page | yes |
| `.logs/*.log`, `*.pid` | the services, from `npm start` | yes |

a report is an artifact and a log is churn, so they live apart. a rerun
of a seed replaces that seed's pair - the directory holds one report per
seed, not one per run. `--out` moves them.


### three command lines

```bash
npm run sim                     # traffic + report + invariants
npm run sim --  --clean         # and sweep this run's rows when the report is written
npm run sim:check               # invariants alone, against the database as it stands
npm run sim:clean -- --dry      # count what a sweep would delete
npm run sim:clean               # sweep every sim_ player
npm run sim:clean -- --prefix sim_42_   # one run only
```

`sim:check` needs no traffic and no sim. it answers the same rules after
a real play session, after a deploy, or in ci. it takes an optional iso
date to scope the ledger rules to rows created since then.


### the sweep

a run leaves a player behind, and every player owns a ship that
`traffic` then returns forever. 160 of 191 players in the dev database
came from sim runs - that is 84% of a 48 KB payload.

`sweep()` deletes by handle prefix, children before parents, across all
5 schemas. a real player never carries the prefix. the guard refuses a
prefix shorter than 3 characters.

`--clean` on the sim sweeps only its own seed, and only after the report
is written - the json and the html keep every number.

**the write models go for good. the projection rows do not.** kafka
still holds the events, so `npm run rebuild` refills `projection.*` with
the players a sweep removed. sweep again after a replay, or accept the
mirror.

`inbox` and `outbox` rows stay. they key on event id, not on a player,
and they are the services' own bookkeeping.


### what else can import this

- `analytics.js` holds the queries the phase 4 admin board wants. it
  imports them instead of growing a second copy of the sql.
- `invariants.js` runs anywhere a pool reaches the database.

both keep working with no sim in sight, which is why they are a package
and not a script.
