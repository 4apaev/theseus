scripts
=======

small operational scripts land here as the project earns them.

### sim.js - load and data run

drives a LIVE stack over http. infra up, `npm start` done, then:

```bash
npm run sim -- --players 20 --minutes 5 --seed 42
```

| flag        | default | what                                  |
|-------------|---------|---------------------------------------|
| `--players` | 10      | how many players register and play    |
| `--minutes` | 2       | how long the run lasts                |
| `--seed`    | clock   | the same seed repeats the same run    |
| `--out`     | `.logs` | where the report lands                |
| `--base`    | `http://127.0.0.1:$GATEWAY_PORT` | the gateway  |
| `--time-scale`    | from `.env` | game years to wall-clock seconds, travel only |
| `--market-drift`  | from `.env` | ms between drift ticks                  |
| `--interest-rate` | from `.env` | what the client shows a leg costs       |

the last 3 restart the services, because each one is read at boot. a
shell variable beats `--env-file`, so the children get the new value.

**keep the 2 clocks together.** `TIME_SCALE` scales travel alone
(`apps/ship-service/src/travel.js`). drift runs on the wall clock. so
the report prints `drift_per_year`:

```
drift steps per game year = TIME_SCALE * 1000 / MARKET_DRIFT_INTERVAL
```

hold that number and a faster run stays comparable:

```bash
npm run sim -- --time-scale 5 --market-drift 250   # 20 steps, as the default
```

change `TIME_SCALE` alone and prices move for a reason that has nothing
to do with the players: a shorter leg gives the destination less time to
restock. so compare a run only against a run with the same
`drift_per_year`.

`--interest-rate` changes a displayed number, not a charge. no service
reads `INTEREST_RATE` - `/api/universe` serves it, and the client uses
it to show the opportunity cost of a leg.

every player registers, opens the websocket feed, then trades, travels,
refits and sends messages. the 202 reply parks against the event that
answers it, so the report holds the wait a player feels, not the wait
the gateway sees.

it writes `.reports/sim-<seed>.json` and `.reports/sim-<seed>.html`.
both are ignored. a rerun of the same seed replaces its own pair, so
the directory holds one report per seed, not one per run.
the html page draws the charts with chart.js from a cdn,
so it wants the network the first time it opens.

**read the report this way**: `asked` is a weight in `sim.js`, so that
histogram only mirrors this file. `answered`, the event counts, and the
rejection reasons come from the game. those 3 carry the news.

**invariants** run at the end, as sql over the final state, in
`packages/sim/src/invariants.js`. no game rule is re-implemented there, so a rule
change never makes them lie. a broken hard invariant exits 1, so the
sim drops into ci unchanged. `market knows every ship` is a known gap,
not a failure - it never fails the run.

**sim and smoke do not mix.** `sim.js` drives the stack that `npm start`
runs. `smoke.js` starts its own copy of every service. run both at once
and each consumer group gets 2 readers, so half the events go to the
copy that is not watching. stop one before you start the other.

**the game views** come from `market.trades` and the event log:

| view | source |
|------|--------|
| most visited stations | `ship.arrived.v1` per stid |
| time in transit and docked | the `departed` → `arrived` pair per ship |
| busiest traders | executed trades per player |
| wallets, profit per player | `player.wallets` less STARTER_CREDITS |
| goods: volume and profit | sells less buys per gid |
| station profit | buys less sells per stid - the mirror of the player view |
| time dilation | `years_abs` less `years_rel` per player |

profit is one subtraction seen from 2 sides. a sell pays the player and
costs the station. so `player_profit` and `station_profit` come from the
same 2 sums, in the opposite order.
