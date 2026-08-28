theseus - progress
================================================

full step list
- phase 3 (current): [phase.3.md](phase.3.md)
- phase 2 (done): [phase.2.md](phase.2.md)
- phase 1 (done): [phase.1.md](phase.1.md)
- game design: [game.md](game.md)
- roles design: [permissions.md](permissions.md)

------------------------------------------------
tests stop matching sql by text ✔
------------------------------------------------

part of [phase.3.md](phase.3.md) step 3.2 (tech debt sweep - a
prerequisite for the "sql code style uppercase" item, not that item
itself, which stays open). the fake db client used to route its canned
responses by matching a substring of the query's own sql text -
`packages/testing/src/mocks.js`'s `fakeClient`/`fakePool`. reformatting
a query's casing or wording, exactly what the uppercase pass would do,
could silently stop a mock matching and break a test with no clear
error.

`packages/testing/src/mocks.js` now has 2 routing modes, neither of
which ever inspects sql text:

- `fakeClient`/`fakePool` - `overrides` is an ordered queue. call N
  gets `overrides[N]`, given that call's params. one entry answers
  every call (a poll's loop of same-shape calls needs only one);
  several entries are a fixed sequence, falling back to `{ rows: [] }`
  past the end - this covers one test driving one deterministic handler
  call sequence, which is nearly everything.
- `fakeTableClient`/`fakeTablePool` - for the one file that doesn't fit
  that shape: `test/gateway.spec.js` shares one pool across ~30
  independent tests hitting different routes in no fixed order. this
  mode routes by the sorted, `+`-joined set of tables a query touches
  (`'ships'`, `'cargo+ships'`, ...), parsed out of the query by the mock
  itself - never hand-typed as a sql fragment by the test author.

every unit spec (`db`, `gateway`, `market`, `player`, `ship`) converted.
the trickiest part wasn't the common case - it was the tests where a
poll's own query count varies per tick (`pollOutbox`: fetch, then mark
only if a row came back) or where 2 differently-shaped calls interleave
inside one loop (`pollDrift`: a station_inventory update, then a
markets update whose response nothing reads). both needed tracing the
real handler's exact query order first, not just carrying the old
override across.

------------------------------------------------
sql code style, uppercase and aligned ✔
------------------------------------------------

closes [phase.3.md](phase.3.md) step 3.2's "sql code style uppercase"
item, now that the fake-client blocker above is gone.
`apps/gateway/src/queries.js` was the style to match: sql keywords
uppercase, right-aligned to the widest keyword in the query.

every raw sql string in `apps/market-service`, `apps/player-service`,
`apps/projection-service`, `apps/ship-service`, `packages/db`, and
`packages/service` now follows it. some queries were also reformatted
from a single line into the aligned block shape, and 2 multi-column
inserts (`apps/projection-service/src/handlers.js`'s `tradeExecuted`,
`priceChanged`) lost their wrapped column lists in favor of one line
each - shorter, and matching the pattern `apps/ship-service`'s own
`shipCreated` insert already used.

migration `.sql` files stay untouched - a separate, much larger
surface, and out of this pass's scope.

a handful of unit-test assertions matched a production query by a
lowercase substring of its own sql text (`sql.includes('update ships')`
and the like) - not the fake-client mock-routing fragility fixed above,
but a real assertion on what query ran. those had to move to the new
uppercase text alongside the production change, in `db`, `market`,
`player`, and `ship` specs.

lint, tsc, the full unit suite, and the integration suite (which runs
every reformatted query against real postgres) are all clean.

------------------------------------------------
fetch → Sync in tests ✔
------------------------------------------------

part of [phase.3.md](phase.3.md) step 3.2 (tech debt sweep - this piece
only, the rest of the step is still open). `test/gateway.integration.spec.js`
was the last file calling raw `fetch()` - every other spec already used
`garage/sync`. now it does too: `Sync.base` set once in `test.before()`,
`.set(headers)` for the bearer token, `.body` instead of `.json()`.

one real behavior difference to get right: `fetch()` resolves normally
on a 4xx/5xx response, but `Sync` rejects with the same parsed payload.
several tests here check a 401/409 status directly, so those calls need
`.then(echo, echo)` to settle either way into the same shape - the exact
idiom `test/gateway.spec.js` already uses for the same reason.

------------------------------------------------
poll() calls ✔
------------------------------------------------

part of [phase.3.md](phase.3.md) step 3.2 (tech debt sweep - this piece
only, the rest of the step is still open). `poll(fx, ms, ...args)` has
taken trailing args directly since it was written - `arrivals.js` and
`drift.js` already called it that way. `packages/db/src/outbox.js` was
the one holdout, still wrapping its function in a closure
(`poll(() => withClient(db, fn), interval)`) instead of passing it
through (`poll(withClient, interval, db, fn)`).

also found while checking every call site:
`packages/util/types/index.d.ts`'s own `poll()` type never declared the
`...args` parameter at all - a real gap between the type and the
implementation, not tied to the wrapper cleanup itself. fixed with a
generic tuple param so the type now matches what `poll()` actually
takes.

------------------------------------------------
cargo hydrate bug ✔
------------------------------------------------

part of [phase.3.md](phase.3.md) step 3.2 (tech debt sweep - this piece
only, the rest of the step is still open). `apps/gateway/src/queries.js`'s
`cargo()` had no `AND c.quantity > 0` - a good sold down to 0 stays a
row in the table, not a deleted one, so a fresh `/cargo/:sid` load could
show a "0 ore" line. the live socket path never had this problem -
`mutateCargo()` in `client/js/events.js` already splices a zero-quantity
row out on every `cargo.loaded`/`cargo.unloaded` event - only a fresh
page load skipped that logic and went straight to the unfiltered query.

------------------------------------------------
NODE_ENV ✔
------------------------------------------------

part of [phase.3.md](phase.3.md) step 3.2 (tech debt sweep - this piece
only, the rest of the step is still open). `.env.dev` sets `NODE_ENV=test`
- the file `scripts/test.sh` and `npm run smoke` already stack on top
of `.env`. `main.js` reads it (`readEnv('NODE_ENV', 'dev')`) and threads
it into `createRoutes({ nodeEnv })`, which skips the per-request log
line when it's `'test'` - a normal `npm run start` still logs every
request, since `.env` alone never sets it.

`garage/compose` already reads `NODE_ENV` on its own (`production` gets
the fast composer, anything else gets the one with dev-time checks).
`test` falling into the same branch as `dev` is what we want there -
tests should keep the stricter checks, not skip them - so nothing in
`garage` needed to change, only getting `NODE_ENV=test` to exist.

------------------------------------------------
ships name generator ✔
------------------------------------------------

part of [phase.3.md](phase.3.md) step 3.1. every new ship used to get
the same fixed name, `far treasure`. now `randomShipName()`
(`packages/domain/src/shipNames.js`) picks one at ship creation - some
from Iain M. Banks' Culture novels, some built from word pools
(adjective + noun + a punny tail). tens of thousands of combinations,
not a short fixed list, since the game will need names at npc scale
later, not only one starter ship per player.

**a real bug this caught early**: the client had a "name your ship"
nudge that compared the ship's actual name against the one fixed
starter name to decide whether to nag the player. once every ship gets
a real name on day one, that comparison never matches. dropped the
nudge - `unnamed()`, `callToAction()`, the `NAMED` session flag, and the
amber `.cta` highlight are all gone (`client/js/render.js` and its
callers). a rename is still one click away, it's just not forced
anymore.

------------------------------------------------
service uptime ✔
------------------------------------------------

part of [phase.3.md](phase.3.md) step 3.2 (tech debt sweep - service
uptime piece only, the rest of the step is still open).
`scripts/services-check.js` used to print only static metadata (role,
owns) - it never said whether a service was actually running. now it
reads `.logs/<name>.pid`, the same file `start.sh`/`stop.sh` already
manage, and reports up/down, pid, and real uptime per service. exits 1
if anything is down.

also dropped `uptime: process.uptime()` from gateway's
`describeService()` - it was always near-zero, since it only ever ran
either right at boot or from a separate short-lived script process,
never the real long-running one. unused everywhere else, so nothing
else needed to change.

------------------------------------------------
universe growth - the stations ✔
------------------------------------------------

part of [phase.2.md](phase.2.md) step 2.4. the map was a triangle of 3
stations. it now holds 5 star systems, 10 stations and 15 links.

**two levels.** a system holds stations. one station in each system
carries the links to other stars - the gateway. the other stations are
planets and moons, and they link only inside their own system.
`Universe.system(sysid, meta)` declares a star, and `node()` raises on an
unknown system. the client map needs the grouping to draw a cluster, so a
station without a system cannot exist.

**Sol is built out**: Mercury Deep, Venus Lab, Sol Outpost, Mars Hub,
Ganymede Yards, Titan Ring. the other 4 systems hold one station each -
Alpha Centauri, Barnards Star, Wolf 359, Sirius.

**the routes are sparse on purpose.** no gateway links to every other
gateway. Sol does not reach Wolf 359 or Sirius directly. a player flies
through Alpha Centauri, or through Barnards Star. that restriction is a
design choice, not a fact about the stars - Sol really is 7.80 ly from
Wolf 359 and 8.60 ly from Sirius, both a straight line. the
fully-connected triangle is gone, so `Universe.path()` now has real
work.

**Mars is the junction of the Sol system**, and Sol Outpost has 2
spokes of its own - straight to Mercury and straight to Mars, on top of
its link through Titan.

**a straight line here is usually not a shortcut, but it can be.**
every in-system distance comes from `|radius_a - radius_b|`, so every
station sits on one line, at its own distance from Sol, in this order:
Mercury, Venus, Outpost, Mars, Ganymede, Titan. when a 3rd station sits
between the 2 being compared, a direct link costs exactly what the long
way costs: titan↔outpost (8.537 AU) equals titan→mars→outpost added
up, since Mars sits between them - and the same is true of mars↔titan
against mars→ganymede→titan. `Universe.path()` finds no shortcut on
either pair. but outpost↔mercury is a real shortcut (0.613 AU direct,
1.661 AU through Venus and Mars), because Outpost sits between Venus
and Mars, not beyond either one. interstellar `path()` also has real
work, since the star systems are not on one line either.

**the first distances were guesses, not data.** the star distances
looked real, but they were written from memory, and 2 of the 7 links
were off by more than a light year. the fix: read the real distances
from `docs/hygdata_v42.csv`, the HYG star catalogue, which ships in
this repo. `alpha.exchange` stands for Rigil Kentaurus, the G2V star of
the Alpha Centauri pair.

**Sol Outpost was also placed wrong.** it first went out at Neptune's
orbit, on a guess that "the gateway" meant "far from home". it now
sits at Earth's, 1.0 AU out, because it is home base - where every new
player starts. the in-system distances stay an approximation, but now
a stated one: the gap between two mean orbit radii, the standard
published NASA figures. Ganymede and Titan are moons, so they sit at
their planet's orbit - Jupiter's and Saturn's.

### the speed limit, and why the physics needed one

real distances broke the travel model. Venus is 0.000013 ly from Mars. at
0.6c that trip takes 0.0004 game seconds - it ends before it starts.

so an edge now carries `c`, a speed limit in fractions of light speed.
`link(a, b, ly, c)` stores `{ ly, c }` on both ends. a route between
stars sets 1, and the ship uses its own velocity. an in-system route sets
0.00008 - 24 km/s, or 1.5 times the speed of Voyager 2.

`travel()` flies at `min(ship.velocity, route.c)`. time dilation follows
the speed the ship really flies. a sublight hop then ages the pilot and
the galaxy by the same amount. only a trip between stars costs the pilot
less time than the clock. the game keeps its point.

the result, at `TIME_SCALE` 20 and a 0.6c ship:

| hop | distance | game seconds | pilot ages |
|---|---|---|---|
| Mars → Outpost    | 0.524 AU | 2   | 0.10 of 0.10 yr   |
| Mercury → Outpost | 0.613 AU | 2   | 0.12 of 0.12 yr   |
| Venus → Mars      | 0.801 AU | 3   | 0.16 of 0.16 yr   |
| Mars → Ganymede   | 3.679 AU | 15  | 0.73 of 0.73 yr   |
| Mars → Titan      | 8.013 AU | 32  | 1.58 of 1.58 yr   |
| Titan → Outpost   | 8.537 AU | 34  | 1.69 of 1.69 yr   |
| Sol → Alpha       | 4.32 ly  | 144 | 5.76 of 7.20 yr   |
| Alpha → Sirius    | 9.52 ly  | 317 | 12.69 of 15.87 yr |
| Barnard → Wolf    | 10.93 ly | 364 | 14.57 of 18.22 yr |

an in-system hop is short, and a trip between stars is long. both are
worth doing. only the trips between stars save the pilot time.

### seed now adds, instead of refusing

`seed()` used to check `select 1 from station_inventory` and stop if any
row existed. a growing universe then got no markets for its new
stations - the check is true after the first boot, forever.

it now reads the existing `stid`/`gid` pairs once, and inserts the rest.
a new station gets its markets on the next boot. a traded market keeps
its stock. `seed()` returns the count of new rows, not a boolean.

### the client map

the map drew one circle of stations. 10 names on one ring is unreadable,
and Mars would sit next to Barnards Port.

it now draws two levels: the systems on one big circle, and the stations
of a system on a small circle around it, in orbit order. the star name
sits in the middle of its cluster. a system with one station puts that
station in the middle instead.

a label on the rim of a cluster grows outward, away from the star, so 6
names in Sol do not smear into one. an in-system route line is dashed and
carries no `ly` label - the line is 28px long. the station tooltip
carries the distance, in AU below one light year (`fmtDist`).

**not done**: travel manifests - see [phase.2.md](phase.2.md) step 2.4.
the client still only marks a station reachable when a direct route
exists. `path()` exists in the domain now (below), but nothing calls it
yet.


------------------------------------------------
universe growth - dijkstra ✔
------------------------------------------------

also part of [phase.2.md](phase.2.md) step 2.4. `Universe.path(from, to,
velocity)` returns the ordered stids from `from` to `to`, both included,
or `undefined` when nothing connects them.

**weighted by travel time, not by `ly`.** the weight of one edge is
`ly / min(velocity, c)` - years, the same unit `travel()` already works
in. a shortest-*distance* search would prefer more `ly` of interstellar
travel over any `ly` of in-system travel, every time, since the speed
gap between them is enormous. it would also be blind to the sublight cap
entirely. weighting by time gets both right for free.

**the winning route can change with the ship.** a ship slower than a
route's cap gains nothing from taking it - the cap never binds. a ship
faster than the cap gets throttled down to it. so the same 2 stations
can have a different best route for a slow ship and a fast one. the unit
test builds a small graph to prove it: one ship picks the short route
because its own speed is already below the cap on the long one; a faster
ship picks the long route instead, because the short one throttles it
down further than the long way costs.

**inside Sol, `path()` mostly ties.** every in-system distance sits on
one line - see the stations section above - so most multi-hop routes
inside Sol cost exactly what a direct link costs, and `path()` returns
one of the tied options. the real work is between the stars, where the
geometry is not a line: `sol.mercury` to `sirius.gate` returns
`sol.outpost → alpha.exchange → sirius.gate`, the 2-hop route, never the
3-hop one through Barnards Star and Wolf 359.

**a plain linear scan, not a heap.** the universe is a few dozen
stations. `path()` is O(V²) per call - fine at this size, wrong for a
universe grown 10x. noted in the domain readme's TODO, not fixed now.

**wired up by travel manifests**, right below.

------------------------------------------------
travel manifests - done ✔
------------------------------------------------

closes [phase.2.md](phase.2.md) step 2.4. `ship.travel.requested.v1`'s
`to` is now the final destination, not necessarily a neighbor.

**one command, not a client-side chain.** `apps/ship-service/src/handlers.js`
resolves the full hop sequence with `universe.path(from, to, velocity)`
the moment the command arrives. the first hop goes on `"to"`, same as a
direct trip always worked; the rest goes on a new `manifest text[]`
column (`apps/ship-service/migrations/003_ships_manifest.sql`). an
unreachable destination now rejects cleanly, `'no route to destination'`
- `path()` returning `undefined` used to fall through to `travel()`
calling `universe.route()`, which throws.

**`arrivals.js` consumes the manifest, one hop at a time.** the poll's
claim query is unchanged - one atomic `update ... where status =
'transit' and arrives <= now() returning ...`, same as before. what's
new: a claimed ship with hops left doesn't stay docked. `advanceManifest()`
pops the next stop, runs `travel()` for that leg, and writes the ship
back to `'transit'` with the new `from`/`to`/`arrives`/`manifest` -
inside the same transaction, so nothing outside it ever observes the
ship mid-manifest as `docked`. each waypoint still gets a real
`ship.arrived.v1`, followed by a real `ship.departed.v1` for the next
leg - the projection and the client's per-arrival rendering both already
know how to handle that pair, so neither needed a single line changed.

**client: wider `.reachable`, same UI.** `client/js/map.js` marks a
station clickable when a plain BFS over the routes list finds any path
to it, not only a direct edge - the universe is small enough that
redoing this walk per render costs nothing. `commands.js`'s `travel(to)`
and the gateway's `/travel` route needed no change at all - the payload
shape `{ sid, from, to }` was already exactly what a manifest departure
needs; only what `to` means got wider. the ly/eta/age hover preview
stays direct-hop-only on purpose - a full multi-hop estimate would mean
duplicating `path()`'s weighted dijkstra in the browser. a multi-hop
destination is still clickable and still travels correctly, it just
shows no numbers on hover until the trip is under way.

**scope, as decided going in**: auto-fill only. a player picks one
final destination and the server works out the path; hand-clicking a
custom sequence of waypoints (overriding the shortest route) stayed out
- no client UI exists for it, and step 2.4 never required it.


------------------------------------------------
drift bug: runaway prices - fixed ✔
------------------------------------------------

reported from the market panel: hydro grain at 2750 credits, void spice
at 99000. the client was correct. the data was wrong.

**cause**: step 2.1 drift moved stock away from its seeded level, to the
limits 0 and `target * 2`, and pinned it there. every good a station
consumes reached 0 stock. price is
`base * (target / max(stock, 1)) ** elasticity`, so stock 0 gives
100 ** elasticity times base - 1000x for spice, at elasticity 1.5.

**fix**: drift is now a restoring force. `seed.js` exports `stockFor`,
the natural level of one station:good - 160 for a producer, 40 for a
consumer, 100 otherwise. a trade moves stock off that level, and drift
brings it back at the station's own rate, never past it. seed and drift
now read the level from one function, so they cannot disagree.

after the fix, a fresh universe holds its levels and prices stay in band:
consumer spice 391, consumer ore 132, consumer grain 68.75. an untraded
market is now silent - the update returns no row, so no event.

**2 more bugs found while fixing it**:

1. `-$4` on an untyped parameter fails with "operator is not unique".
   postgres cannot find the type. the `::int` casts are load bearing,
   like the `::text` cast in the gateway's traffic query.
2. **`poll()` died on one bad tick.** `rs = await fx()` with no catch:
   a rejection stopped the loop for the life of the process, with no
   report. `pollOutbox` runs on `poll`, so one failed publish would stop
   every event a service sends, forever. this is the second time it hid
   a bug - the first was the Date/isoTime bug in ship arrivals. `poll`
   now catches, logs, and continues, and `test/util.spec.js` covers it.

**not a client bug**: the browser rendered exactly what
`GET /market/:stid` returned. an older divergence between
`market.markets` and `projection.market_prices` was stale data in the dev
database, from before `event_log` existed. after a clean re-seed all 9
rows match.

------------------------------------------------
ship rename + first-login call to action - done ✔
------------------------------------------------

a player can now name their own ship. a new player is asked to do it.

- [x] `packages/contracts` - `field.shipName`: 1-24 characters, letters,
      digits, space, and `- ' .` only, and no padding. a new command
      `ship.rename.requested.v1`, and 2 new events, `ship.renamed.v1` and
      `ship.rename.rejected.v1`
- [x] `apps/ship-service/src/handlers.js` - the `UPDATE` is scoped by
      `sid` **and** `pid`. a player who aims at another player's ship
      matches no row and gets a rejection. ownership needs no extra read
- [x] `apps/projection-service/src/handlers.js` - `shipRenamed` writes the
      new name to the read model
- [x] `apps/gateway/src/routes.js` - `POST /rename`. the `pid` comes from
      the token, never from the body. a bad name fails contract validation
      and returns 400 before it reaches kafka
- [x] `apps/gateway/src/feed.js` - `publicShipRenamed` puts `ship.renamed`
      on the public allowlist. the name is already public in `/traffic`,
      so every player sees the change at once
- [x] client - the ship name in the SHIP panel is the control. click it
      to open `#nameDialog`. it has a dashed underline, a `rename`
      tooltip, and an inverting hover, because it is the only clickable
      text in the client. amber until the player picks a name.
      `client/js/commands.js` holds the same name rule, so a bad name
      gets an answer with no round trip. the contract stays the authority
- [x] tests - 7 new: the name rule, 2 ship-service cases (rename, and a
      foreign ship), 2 gateway route cases, and 2 integration cases against
      real postgres

**2 bugs found in the browser, not by the tests**:

1. the prompt did not open for a new player. `hydrate()` reads `/ships`
   before the projection has the starter ship, so `state.ship` was still
   empty when the prompt ran. the prompt now runs at 2 points - after
   hydrate, and again when `ship.created` arrives. the first one that
   finds a ship wins.
2. `logout()` never cleared `state.me`. `hydrate()` refills it only when
   it is empty, so the next player on that tab kept the previous player's
   identity. `mine(p)` then read their own new ship as another player's -
   the feed said "new ship" instead of "commissioned", and the SHIP panel
   stayed empty. `resetPlayer()` in `state.js` now clears the player data
   on logout. this bug was older than this feature. `mine()` made it
   visible.

**how the first login is detected**: the starter ship is called
"far treasure". a ship with that name was never renamed. so there is no
flag, no column, and no extra state - the rule works on any device, and it
stops as soon as the player picks a name. `LATER` hides the dialog for
that tab only, with `sessionStorage`. the clickable name stays.

proved live: A renamed to "Rocinante", A and B both saw it. an empty name,
a 29-character name, `<script>alert(1)</script>` and an emoji name all
returned 400. B could not rename A's ship.

------------------------------------------------
step 2.3: player presence - done ✔
------------------------------------------------

before this step a player saw only their own ship. now a player sees
every other ship, and who is in port.

design decided in [permissions.md](permissions.md): "ship traffic is
public by default". public means any authenticated player, not anonymous.

- [x] `apps/gateway/src/queries.js` - `traffic(stid)`. one query serves
      both routes, so they cannot disagree. it returns the handle, never
      the `pid`. it hides `capacity`, `velocity` and `years_rel` too - a
      rival's ship specification is game information
- [x] `apps/gateway/src/routes.js` - `GET /traffic` (the whole fleet) and
      `GET /station/:stid/ships` (one station). both sit below
      `gw.use(auth)`, next to `/market/:stid`
- [x] `apps/gateway/src/feed.js` - restructured. the old ternary could not
      say "carries a pid **and** broadcasts", and every ship event carries
      a pid. now: `seesAll(claims, pid)` is a named function, `PUBLIC` is
      an allowlist of redaction functions, and `push()` builds at most 2
      frames per event, each one time
- [x] `client/js/traffic.js` (new) - `state.traffic`, a Map of `sid` to
      another player's ship
- [x] `client/js/events.js` - **the important fix.** the 3 ship handlers
      called `Object.assign(state.ship, ...)` with no owner test. after
      this step another player's departure would overwrite your own ship.
      each handler now tests `mine(p)` first. `flavor()` also split, so a
      stranger's move no longer reads "you age N yr"
- [x] `client/js/map.js` - N markers with `data-sid`, and
      `tickShipMarker` became `tickShipMarkers`. docked ships are not
      dots - many dots at one station make one unreadable pile, so the
      station tooltip lists them and the station gets a `busy` class
- [x] `client/js/render.js` + `index.html` - a `PORT` panel lists who else
      is docked with you
- [x] tests - 8 new: 4 route cases (including "both routes run the same
      sql"), `seesAll` alone, 3 socket cases, and a 2-player integration
      case. `test/gateway.integration.spec.js` now starts ship-service too,
      because the traffic routes need real ships

**how the client knows its own ship**: the gateway removes the `pid` from
another player's event. so an event that still carries a `pid` is your
own. do not compare `sid` - `state.ship` is `undefined` until your first
ship exists, and your own `ship.created` would then look like a stranger.

**where the fields are removed**: in the gateway, at the last moment, when
it writes one frame to one socket. the events on kafka do not change. the
projection needs `pid` to know who owns a ship, and `scripts/rebuild.js`
replays the raw `event_log`. the bus carries the truth. the gateway
decides who sees it.

**one test trap**: `fakeClient` matches sql by substring, first key wins.
`projectionPool()` already held a `'FROM ships'` key, and the new query
contains that text. the fixture uses `'JOIN players p'` instead, placed
first.

proved live, not only in tests: 2 real players, real postgres and kafka.
the owner's socket received `pid`, `years_rel` and `correlation_id`. the
other player's socket received `sid`, `from`, `to`, `arrives` and
`years_abs`, and nothing else.

------------------------------------------------
step 2.2: roles & visibility - done ✔
------------------------------------------------

design in [permissions.md](permissions.md) - all 3 open questions
resolved before the build started (handle-only public visibility,
read-only + rebuild admin surface, `ADMIN_HANDLES` bootstrap). role
plumbing follows the doc's own 4-item list exactly.

- [x] `apps/player-service/migrations/004_players_role.sql` - `players`
      gains `role text not null default 'player'`
- [x] `apps/player-service/src/handlers.js` - `loginPlayer` reads `role`,
      promotes to `'admin'` on an `ADMIN_HANDLES` match (never demotes -
      an env change alone can't strip an existing admin), `role` rides
      in `player.login.succeeded.v1`'s payload
- [x] `packages/contracts/src/schemas.js` - `playerLoginSucceeded` gains
      `role: field.has('player', 'admin')`, required
- [x] `apps/gateway/src/routes.js` - `/login` signs `role` into the JWT
      and returns it in the reply body; new `requireRole(role)`
      middleware; 4 admin routes, all gated:
      `GET /admin/players` `/admin/events` `/admin/inventory/:stid`,
      `POST /admin/rebuild`
- [x] `apps/gateway/src/queries.js` - `allPlayers()` / `eventLog()` /
      `inventory(stid)`. `inventory` reads `market.station_inventory`
      directly (schema-qualified) - the projection only mirrors quotes,
      not raw stock, and stock is the "source of truth" the doc calls for
- [x] `apps/gateway/src/main.js` - imports the existing `scripts/rebuild.js`
      (unchanged), injects it into `createRoutes` as `rebuild`, overridable
      via `opt.rebuild` for tests
- [x] `apps/gateway/src/feed.js` - ws fanout: `claims.role === 'admin'`
      skips the pid filter, admin sockets see the full firehose
- [x] types updated: `packages/contracts/types/events.d.ts`
      (`player.login.succeeded.v1` gains `role`), `apps/gateway/types/`
      (`queries.d.ts`, `routes.d.ts`, `main.d.ts`)
- [x] tests: `test/player.spec.js` (promotion, no-op re-promotion,
      `role` in the succeeded payload), `test/gateway.spec.js`
      (403 without the role, all 4 admin routes, admin ws firehose),
      real end-to-end via `test/gateway.integration.spec.js`'s `/login`
      call and `npm run smoke`

client stays untouched on purpose - it never read `pid`/`handle`/`role`
from the login response to begin with, only the token; a role-aware
client UI is phase 3+ (`phase.2.md` step 2.2 called this optional).

------------------------------------------------
step 2.1: living economy - done ✔
------------------------------------------------

`station_inventory`'s `stock`/`target` and `universe.js`'s
`produces`/`consumes` numbers existed since step 6 but the numbers
(`ore: 8`, `grain: 5`, …) were never read anywhere - seed.js only used
their *presence* to place a station at a fixed surplus/scarcity, once,
at boot. this step is their first real use.

- [x] `apps/market-service/src/drift.js` (new) - `pollDrift(pool,
      transact, { interval })`, same `poll()` shape as `pollOutbox` /
      `pollArrivals`. every tick: producers gain stock at their
      `produces` rate, consumers lose stock at their `consumes` rate,
      clamped to `[0, target * 2]` - an idle station settles at an
      extreme and goes quiet (the clamped `UPDATE ... WHERE stock <>
      ...` returns no row, so a settled pair emits nothing)
- [x] `apps/market-service/src/main.js` - `Market.start()`/`stop()`
      mirror ship-service's `arrivals` pattern for `this.drift`
- [x] `MARKET_DRIFT_INTERVAL` env var, default `1000`ms in production
- [x] `interval: 0` turns drift off entirely - `poll()` fires its first
      tick immediately and unstoppably, so a `.stop()` call right after
      `start()` cannot undo it. integration tests and `smoke` set
      `MARKET_DRIFT_INTERVAL=0` for this reason; drift's own behavior is
      covered by unit tests (`test/market.spec.js`) against a fake client
- [x] `apps/market-service/types/main.d.ts` - `start()`'s resolved type
      gains `drift: Poller`

bug caught mid-build, not by design review: an early draft called
`each()` (`garage/util`) with an async callback expecting it to wait -
`each()` is a synchronous loop, it does not await. `driftTick` returned
before any row had actually updated. caught by the unit test asserting
6 events, not by reading the code.

------------------------------------------------
travel timer persistence - done ✔
------------------------------------------------

phase 1 (steps 0-10) was done. this was the first phase 1.5+ item, picked
because it was a real bug: `apps/ship-service/src/handlers.js` scheduled
ship arrival with a raw in-process `setTimeout(arrive, trip.ms, ...)`.
restart ship-service while a ship was in transit and that timer was gone -
nothing ever called `arrive()` again, the ship sat at `status = 'transit'`
forever, `ship.arrived` never fired.

ship travel was the only deferred/timed state transition anywhere in this
codebase. `packages/db/src/outbox.js`'s `pollOutbox()` was the one
existing precedent for the fix shape - state lives in postgres, a periodic
loop claims what's due - so that's the shape this used, no new pattern.

- [x] `apps/ship-service/migrations/002_ships_correlation.sql` - `ships`
      gains nullable `causation_id`/`correlation_id` columns, persisted for
      the duration of a trip so a restart-recovered arrival can still
      correlate `ship.arrived` back to the original travel command
- [x] `apps/ship-service/src/handlers.js` - travel-request handler's
      `update ships` also writes `causation_id`/`correlation_id`; the
      `setTimeout` line and the module-level `arrive()` function are gone
- [x] `apps/ship-service/src/arrivals.js` (new) - `pollArrivals(pool,
      transact, {interval})` wraps `@theseus/util`'s `poll()` around one
      atomic `update ships set status='docked', stid="to", arrived=arrives
      where status='transit' and arrives <= now() returning ...` - one
      statement, not select-then-loop-update, so two overlapping pollers
      (e.g. mid-deploy) can't double-claim the same row
- [x] `apps/ship-service/src/main.js` - `Ship` overrides `start()`/`stop()`
      to own the poller's lifecycle; no changes to the shared
      `packages/service` base class, this is ship-specific
- [x] `.env.dev` - `SHIP_ARRIVAL_INTERVAL=25`, same rationale as
      `OUTBOX_INTERVAL=25` right above it
- [x] `test/ship.spec.js` - removed the 2 tests asserting the old
      `setTimeout`/mock-timers mechanism, added a `pollArrivals` section
      mirroring `test/db.spec.js`'s `pollOutbox` tests
- [x] `test/ship.integration.spec.js` - unchanged, still passes (already
      waited on events generically, unaware of the scheduling mechanism)
- [x] verified live: real broker + real postgres, killed ship-service
      mid-transit (`bash scripts/reboot.sh ship`), confirmed the row
      survived untouched and the fresh process's first poll tick docked it
      and published `ship.arrived.v1` through to the projection - the one
      scenario that was actually broken, with no automated test for
      "process died and came back" specifically
- [x] `apps/ship-service/readme.md`, `docs/game.md` - TODOs dropped

**real bug found while building this, not just the one it fixed**: the
first version emitted `ship.arrived` using the `arrived` column straight
off the `RETURNING` clause. `packages/db/src/pool.js` registers a custom
type parser for `timestamp` columns that returns a `Date` object, not a
string - but the event schema requires `field.isoTime` (a string).
`emit()` validates synchronously and throws, inside the transaction, so it
rolled back - meaning the ship silently stayed stuck in `transit` and the
poller died on its very first real arrival (an uncaught rejection inside
`poll()`'s tick loop stops rescheduling). caught immediately by running
`npm run test int` for real rather than trusting the design read-through;
fixed with `ship.arrived.toISOString()`.

------------------------------------------------
step 10: projection rebuild - done ✔
------------------------------------------------

truncate + replay from the event log.

**why**: hit it for real - `market.ships` (market-service's mirror,
rebuilt from `events.ship`) only had the 2 ships created after today's
`npm run start`; every older ship (going back a day+ in `ship.ships`,
ship-service's authoritative table) is invisible to it and trades against
those ships reject with `ship unknown`. root cause: a consumer group
resumes from its committed offset on restart rather than replaying
(`apps/gateway/src/main.js`'s own comment says as much) - if a projection
table ever gets emptied independently of that offset, it can never
self-heal. **scope decided**: build it for `projection-service` only
(matches phase.1.md's step 10 wording exactly, and it's the clean case -
zero FKs across all 6 migrations, zero saga state, everything genuinely
derivable by replay). `market-service`'s mirror has the identical exposure
but mixes pure mirrors (`ships`/`cargo`) with saga-owned tables
(`station_inventory`, `trades`) that a blanket truncate+replay would
wrongly wipe - leave that as a documented gap on
[market-service's readme](../apps/market-service/readme.md), not fixed
here.

**second data point, same day**: while verifying the cargo sell button,
`projection.market_prices` turned out stale too - `market.markets` had
sol.outpost/grain at `price_buy 68.75` but `projection.market_prices` was
still showing `41.04` (last written 2026-07-24 23:29, well before the
real price moved), so a buy at the client-displayed price got rejected
server-side as `price above limit` (the 10% headroom wasn't enough to
cover the drift). same mirror-goes-stale-and-never-heals shape as the
`ship unknown` case above, just hitting `market_prices` instead of
`ships` - another concrete argument for building step 10 exactly as
scoped (projection-service's tables) rather than treating today's
`ship unknown` as a one-off.

**design** (matches the sketch in `docs/dacrap/steps.p.md`'s old step 9,
and `permissions.md`'s "this is step 10" note): each opted-in service
keeps its own durable, append-only `event_log` (not a Kafka replay - kafka
has no offset-reset/admin capability in `packages/kafka` today, and topics
aren't infinite-retention anyway). rebuild = truncate the read-model
tables + replay `event_log` ordered by `received, eid` - this service's
own write order, not the producer-side `occurred` clock (different
producers' clocks aren't guaranteed monotonic relative to each other;
`received` is assigned by this one consumer writing sequentially, so it
matches true consumption order) - through the exact same handler map the
live consumer uses - never touches kafka/inbox at all.

- [x] `packages/service/src/index.js` - `static logEvents = false` (opt-in
      per service), `Service.start()` writes every consumed event to
      `event_log` before dispatch when the subclass sets it `true`
- [x] `apps/projection-service/migrations/007_event_log.sql` - `eid` pk,
      `event_type`, `payload` jsonb, `occurred`, `received`
- [x] `apps/projection-service/src/main.js` - `logEvents = true`, exports
      `createHandlers` (package `exports` map only exposed `main.js` before)
- [x] `scripts/rebuild.js` + `npm run rebuild` - truncate `players` /
      `wallets` / `ships` / `cargo` / `market_prices` / `trade_history`,
      replay `event_log` through `createHandlers()`'s dispatch map. run
      with projection-service stopped (documented, not enforced)
- [x] `test/projection.rebuild.integration.spec.js` - full loop through
      real handlers (player → ship → market buy/travel/sell), snapshot the
      6 tables' business columns, rebuild, snapshot again,
      `assert.deepEqual` - identical every time; also re-ran
      `npm run rebuild` back-to-back by hand against `theseus_test` to
      confirm the truncate+replay itself is idempotent
- [x] `apps/market-service/readme.md` - doc note on the same staleness
      risk, explicitly out of scope for this pass

**important gap, not a bug**: `event_log` only fills going forward from the
moment a service restarts with `logEvents = true` - it cannot backfill
events consumed before that. once the table exists, `npm run rebuild`
truncates and replays unconditionally - if `event_log` covers less than
the read models' full history, everything outside that window is silently
gone, no warning. the only free pass is before the table exists at all
(the transaction then rolls back on the missing-relation error, a no-op).
**do not run `npm run rebuild` against the real `theseus` db** until
`projection-service` has been running continuously on this code for at
least as long as the oldest row worth keeping.

admin-gated `POST /admin/rebuild` from `permissions.md` stays separate -
depends on role plumbing (`players.role`, `requireRole`, JWT claim) which
doesn't exist yet either (confirmed: no `role` column, no `requireRole`,
no admin routes anywhere in the repo). this step shipped as a plain script
first, matching `services:check`/`infra:health`/`smoke`.

------------------------------------------------
step 9: minimal client - done ✔
------------------------------------------------

single html file, websocket-driven - plan in [client.md](client.md)

- [x] `client/` (`index.html` + `style.css` + `app.js`) - top-level, not
      nested in the gateway app, not an npm package. terminal theme (dark, monospace, phosphor glow,
      css scanlines), no framework, no external assets
- [x] `GET /` `GET /universe` - public routes on the gateway, `clientPath`
      threaded `opt.x ?? readEnv('GATEWAY_CLIENT_PATH', ...)` same as every
      other gateway config value; universe/goods/starter serialized once
- [x] auth screen - register (201 auto-login / 409 / 202 queued+retry),
      login, token in `localStorage`, auto-login on reload
- [x] hydrate - `/me` retried during projection lag, `/universe` once,
      `/ships` `/cargo/:sid` `/market/:stid` `/trades`
- [x] websocket feed - `?token=` query, dispatch table per event type,
      pending-command correlation (✓/✗ marks the original feed line),
      reconnect with exponential backoff (capped 10s) + re-hydrate
- [x] live flavor - years-rel/years-abs copy, eta + capital-cost route
      previews mirroring `@theseus/domain`'s trade math, buy/sell slack
      hints, disabled/empty states throughout
- [x] found + fixed in manual verification: `packages/db` had no utc
      override for postgres `timestamp` columns - the `pg` driver read them
      back in the host's local timezone instead of utc, so the countdown
      showed "arriving…" immediately instead of counting down. one-line
      fix (`pg.types.setTypeParser`) + regression test, see decisions log
- [x] verified live in a real browser (playwright via docker mcp toolkit):
      register → login → buy → travel → live countdown → arrival,
      gateway kill/restart → client reconnects and re-hydrates, logout

------------------------------------------------

step 8: gateway (http + websocket) - done ✔
------------------------------------------------

details in [apps/gateway/readme.md](../apps/gateway/readme.md)

- [x] **real kafka connection** - done (details in [kafka readme](../packages/kafka/readme.md)):
    - [x] `kafka/src/client.js` - `createKafkaClient({ brokers, clientId })` via `kafkajs`;
          topics ensured before subscribe (serialized), transient broker errors retried
    - [x] the little refactor - services are classes now: [`@theseus/service`](../packages/service/readme.md)
          base owns the lifecycle, `Kind.run()` is the composition root -
          `node apps/<svc>/src/main.js` actually boots against compose
    - [x] `events.all` fanout gap fixed - projection subscribes to the concrete event topics
    - [x] `npm run smoke` - the full loop through the REAL broker: register → buy ore →
          fly → sell → profit ₢830.68, projection read models populated;
          repeat runs resume consumer groups, inbox dedup holds
    - [x] `util.guid(prefix?)` - the one id helper, `crypto.randomUUID` imports gone
    - [x] `.env.dev` - test knobs stacked via `--env-file`, spec env hacks removed
- [x] `@theseus/auth` - `signJwt` / `verifyJwt` / `createAuth({ secret, ttl })` -
      hand-rolled HS256, `verify` throws a coded `Fail` (401) on bad/expired/malformed
      tokens; secret stays out of player-service, see [readme](../packages/auth/readme.md)
- [x] http routes → commands - `garage` app, payload validated pre-publish (417 → 400),
      `pid` from token claims, 202 `{ cmd, correlation_id }`
- [x] `POST /register` / `POST /login` - correlated reply over `events.player`
      (new `player.login.requested.v1` + `login.succeeded/rejected.v1`), gateway
      signs JWT; 201/409/202 register, 200/401/504 login
- [x] read routes against projection tables - `/me` `/ships` `/cargo/:sid`
      `/market/:stid` `/trades`
- [x] websocket event feed - hand-rolled rfc 6455, `?token=` before the 101,
      per-pid fanout + price broadcast, ping/pong keepalive; `scripts/ws-probe.js`
- [x] tests - 29 unit (routes, frame codec, handshake, fanout, heartbeat, waiter),
      7 integration (register → login → /me, command lands, ws filtering)

------------------------------------------------

step 6: market service - done ✔
------------------------------------------------

- [x] scaffold - deps, `main.js`, `handlers.js`, `seed.js`, pg schema `market`
- [x] migrations - markets (quote board), station_inventory (source of truth),
      ships (mirror), cargo, trades (saga state machine)
- [x] seed - stock + quotes per station × good from universe economy profiles,
      `market.price.changed.v1` published for each (the deferred step-5 item)
- [x] the locked stock - sagas `select … for update` the inventory row and
      compute prices from it; `markets` is write-only for trade logic
- [x] buy saga - reserve stock → `wallet.debit.requested` (rfid = tid) →
      on `wallet.debited`: cargo loaded, trade executed, quote republished
- [x] sell saga - hand over cargo → `wallet.credit.requested` →
      on `wallet.credited`: station restocked, trade executed, quote republished
- [x] compensation - wallet rejection releases stock (buy) or returns cargo (sell)
- [x] ships mirror from `events.ship` - docked/transit + capacity checks
- [x] kafka `createCommander` - command sibling of `createEmitter`
- [x] tests - 21 unit (rejections, reserve, settle, compensation, mirror, seed);
      market integration (reserve → debit → settle); **full game loop**:
      register → buy ore → fly → sell → trader ends richer than ₢1000



------------------------------------------------

done
------------------------------------------------

| step | what                                                                  |
|------|-----------------------------------------------------------------------|
| 0    | rename pass on [contracts](../packages/contracts/readme.md)           |
| 1    | [db package](../packages/db/readme.md) - pool, inbox/outbox, migrate  |
| 2    | [projection service](../apps/projection-service/readme.md)            |
| 3    | [player service](../apps/player-service/readme.md) - register, wallet |
| 4    | [ship service](../apps/ship-service/readme.md) - travel + starter saga|
| 5    | universe seed - [domain](../packages/domain/readme.md) graph, goods, economy |
| 6    | [market service](../apps/market-service/readme.md) - buy/sell sagas, prices |

also: CI (github actions, node 26), pre-push env hook, pg schema per service,
integration test harness in [testing](../packages/testing/readme.md).

------------------------------------------------


decisions log
------------------------------------------------

- password hashing        : `node:crypto` scrypt - no pg extension, hash before it hits the DB
- station vs port rename  : keep `station / stid` - port is UI copy only
- outbox pattern          : write + domain in one tx; polling loop publishes to kafka
- migration conflicts     : postgres schema per service - `DB.create({ schema })` sets `search_path`,
                            each schema gets its own tables + `schema_migrations`; db-per-service deferred
- starter ship            : ship-service saga on `player.created.v1` - ownership stays with ship-service
- universe                : graph in `@theseus/domain` - nodes with economy profile, undirected edges
- market prices           : float on supply/demand (`price` + `spread`), no fixed state prices
- cargo ownership         : market-service owns cargo + keeps a ships mirror from `events.ship` -
                            trades touch stock/cargo/prices in one service, the only saga hop is the wallet
- the locked stock        : sagas `select … for update` the inventory row and compute prices
                            from it; `markets` is a write-only quote board, nothing ever joins them
- auth
    - gateway issues JWT on login, validates locally, player service not called at read time
    - `@theseus/auth` (signJwt/verifyJwt) deferred to step 7 - keeps JWT secret out of player service
- login over kafka       : `player.login.requested.v1` command, player-service verifies the hash
                           and replies `login.succeeded/rejected.v1` - hash never leaves player-service;
                           reply is direct-published (no outbox: nothing to keep atomic, no ~1s poll
                           latency, no auth noise in the durable log); gateway awaits by correlation_id
- passwords in transit   : plaintext inside `commands.player` payloads (register always worked this
                           way) - broker is docker-internal, accepted for now; mitigations if it ever
                           matters: topic retention, broker tls. pre-hashing client-side is pointless,
                           the digest would just become the password
- gateway http           : `garage` (the house lib) - router, middleware, `Fail.code` → http status
- gateway ws             : hand-rolled rfc 6455, jwt via `?token=` checked before the 101
                           (browsers cannot set ws headers); stable consumer group `gateway` on the
                           five concrete event topics - resumes offsets instead of replaying per boot
- crypto split
    - `player/src/crypto.js` owns `hash`/`verify` (credential management only)
- client location        : top-level `client/index.html`, not nested in the gateway app and not
                           an npm package - cors was never about file location, only which process
                           serves the response, so the gateway can keep being the sole server without
                           owning the client's code. path is `GATEWAY_CLIENT_PATH`, threaded the same
                           `opt.x ?? readEnv(...)` way as every other gateway config value
- utc timestamps          : `packages/db`'s pool now forces `pg.types.setTypeParser(1114, ...)` to
                           read naive `timestamp` columns as utc - the driver's default parses them
                           in the host's local timezone, silently shifting every value by the host's
                           utc offset (found via the client's live countdown reading an `arrives` 3
                           hours in the past on a UTC+3 dev machine). affects every naive-timestamp
                           column project-wide (ships, players, wallets, trade_history, ...), fixed
                           once at the driver level - no schema/migration change


------------------------------------------------

tech debth & refactors
------------------------------------------------
### ship update
should be able to rename player's ships


### permissions - roles and visibility
design note in [permissions.md](permissions.md) - `players.role` →
login reply → JWT claim → `requireRole('admin')` middleware, role-aware
ws fanout, read-only admin surface + `POST /admin/rebuild` (step 10's home).
decided: ship traffic + market transactions public by default, future
transponder-off mechanic hides movement. still open: leaderboard, admin
powers, admin bootstrap. plumb roles before the html client (step 9).

### kafkajs `TimeoutNegativeWarning`
upstream quirk in kafkajs' request queue (`scheduleCheckPendingRequests`
computes a negative delay, node clamps to 1ms) - harmless noise on boot,
not our code. revisit if kafkajs ships a fix or we swap clients.

### gateway logger
gateway should use logger, the logger should live in `garage/mware`

### websocket lib - done ✔
extracted to `packages/ws`, then moved again to `garage/mw/ws`.
gateway's `feed.js` now imports it straight from `garage` - `packages/ws`
is gone, and so is its own copy of `test/ws.spec.js` (garage tests its
own protocol code now).

### garage
1. `Sync.parse` throws if `response.ok` is `false` - make it optional
2. `Fail` refactor, `code` should be optional, map system error errno to http status
3. add useful `middleware` under `garage/mware` like `logger`, `cors`, `etag`, `gzip` etc...

### `pkg/util`
- `garage/util/Fail` fix msg/code bug or create `class Chaos extends Error` instead

### cleanup & order
move to `pkg/db` from `pkg/util`
- `Query`
- `where`
- `selectWhere`
- `withClient`

### npm version
    a version bump script for each app/pkg.

### `setTimeout` as travel timer
    in-process `setTimeout`, doesn't survive restarts.
    postgres as durable schedule or redis.

### `Universe` path
    dijkstra multi hop routing, when the map outgrows
    the fully connected triangle.

### `market:sagas`
    add `auction` saga, when players can bid against other players

------------------------------------------------

### admin dashboard
the game needs an admin dashboard
1. manage game assets
2. deployment tasks
3. monitoring (grafana, kibana, prometheus)

### game assets
lives in text file, read on startup and populate.
consider dedicated table
- ships
- goods
- stations
- weapons
- armor
- etc...