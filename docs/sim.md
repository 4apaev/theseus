sim
================================================

the load and data run lives in `packages/sim`. the flags, the report
views and the tempo rules are in [scripts/readme.md](../scripts/readme.md).
this document plans the next step - players that think - and prices it
first.

```
packages/sim/src/
  run.js          the harness - tempo, players, the tick loop
  player.js       one player's transport: http, websocket, pending commands
  players/dice.js the weighted random brain
  stats.js        every request and every command outcome
  analytics.js    the read models - the admin board imports these
  invariants.js   the rules - runnable against any database
  report.js       stdout, json, and the html page
```

`scripts/sim.js` and `scripts/sim-check.js` are the 2 command lines over
it. a player module exports `turn(player, peers, stats)`, so an agent
brain drops in beside `dice.js` and shares the whole harness. that
sharing is the only way an agent run compares to a dice run.


what the sim does today
------------------------------------------------

it drives a live stack over http. every player registers, opens the
websocket feed, then trades, travels, refits and sends messages until
the clock runs out. a dice roll picks each action.

the report answers 3 questions:

1. **what happened** - event counts, station visits, the travel clock,
   goods volume, profit per player, per good, and per station.
2. **how fast** - request percentiles, and the wait from a command to
   the event that answers it.
3. **what holds** - 10 invariants as sql over the final state. a broken
   hard invariant exits 1, so the sim drops into ci unchanged.

the sim found 2 real defects on its first runs: a debit row for a
refused trade (fixed), and `traffic` returning every ship ever
registered (open, see [tech.debt.md](tech.debt.md)).


the next step: agents
------------------------------------------------

the dice are the limit. a random player never arbitrages, so it buys
and sells at the same station and loses the spread every time. the
economy is never tested, because nobody trades on purpose.

an agent player replaces the dice with a model. it reads the market,
carries cargo to a station that pays more, and answers for the result.
the same report then measures the game instead of the dice.


mcp or api
------------------------------------------------

**the transport does not set the cost.** the model sees the same 4
things either way: the system prompt, the tool definitions, the history,
and the tool results.

**mcp costs more for this job.** the server injects its whole tool list,
with descriptions you did not write, and with tools this player never
calls. a hand written tool set over the http api is smaller, and you own
every byte of it.

mcp earns its cost when a person plays through claude desktop or claude
code. for 20 bot pilots, write 7 tools.


what the payloads cost
------------------------------------------------

measured against the live gateway. tokens are bytes over 4, not a real
count - see the caveat at the end.

| route | bytes | ≈ tokens |
|-------|-------|----------|
| `GET /api/ship/traffic` | 48858 | **12215** |
| `GET /api/universe` | 7101 | 1775 |
| `GET /api/station/:stid/market` | 833 | 208 |
| `GET /api/ship` | 326 | 82 |
| `GET /api/player/me` | 129 | 32 |

`traffic` decides the whole bill. it returns every ship ever registered.
history repeats on every turn, so one call is paid again on every later
turn of that conversation.


what a run costs
------------------------------------------------

20 agents, 40 turns each. the static prefix is 1556 tokens: 7 tool
schemas and a trimmed rulebook.

| scenario | opus 5 | sonnet 5 | haiku 4.5 |
|----------|--------|----------|-----------|
| traffic every turn, no cache, high effort | **$1107** | $443 | $221 |
| trimmed reads, no cache, high effort | $123 | $49 | $24 |
| trimmed reads, cached | $117 | $47 | $23 |
| cached, low effort | $44 | $17 | $8 |
| cached, low effort, history cleared every 10 turns | **$15** | $6 | **$3** |

the same 800 turns cost $1107 or $15 on the same model. the model is the
last lever, not the first.

prices per 1M tokens, 2026-06: opus 5 $5 in / $25 out, sonnet 5 $2 / $10,
haiku 4.5 $1 / $5. a cache read costs about a tenth of an input token.


how to keep it small
------------------------------------------------

in order of what it saves:

1. **never give an agent `traffic`.** add a station scoped read. this one
   change is 98% of the bill.
2. **clear old tool results.** game state is readable at any time, so an
   old read is dead weight. use `context_management` with
   `clear_tool_uses_20250919`.
3. **cache the prefix.** the tools and the system prompt are the same
   bytes for all 20 agents. check `usage.cache_read_input_tokens`. a
   zero there means something volatile sits in the prefix.
4. **set `effort` to low.** a choice between 7 actions is not a
   reasoning problem. this cut output tokens 4 times in the model above.
5. **use structured outputs.** the action comes back schema valid, with
   no prose around it.
6. **return the whole turn in one tool.** ship, wallet, cargo and the
   local market in one result beats 4 round trips that each grow the
   history.

model choice comes last, and it is a decision for a person. the spread
between opus 5 and haiku 4.5 is 5 times.


what to settle before building
------------------------------------------------

- **measure the real token counts.** the table above divides bytes by 4.
  `messages.count_tokens` gives the true number and costs nothing.
- **agents and dice in one run.** a dice player is a control group. run
  both and compare profit per player.
- **one agent, one conversation, or one agent per turn?** a conversation
  remembers the last port and the price it paid. a fresh turn costs less
  and learns nothing. measure both.
- **tempo.** an agent thinks for seconds. at `TIME_SCALE=20` a leg takes
  20 seconds, so the agent keeps up. at a lower tempo it does not, and
  the run measures the model's latency, not the game.


the caveat
------------------------------------------------

every token number here is bytes divided by 4. it is the right shape and
the wrong digits. the ranking of the levers does not change, because
`traffic` is 60 times the size of a market read whatever the tokenizer
says. replace these numbers with `count_tokens` output before anyone
plans a budget from them.
