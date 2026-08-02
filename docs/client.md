client - the plan
================================================


step `9` in [phase.1.md](phase.1.md) - minimal client: **html + css + js,
websocket-driven**. status: done ✔.

closes the phase-1 success criteria: register, get a ship, trade, travel,
and see it all update live - through a browser. first real consumer of the
gateway api.

decisions:
- lives at top-level `client/` (`index.html`, `css/`, `js/`, `img/`) -
  not nested in the gateway app, not an npm package (no deps, nothing
  imports it). html served by `GET /`, everything else by one generic
  `GET /pub/:file(.*)` (see `apps/gateway/readme.md`); the html's path
  comes from `GATEWAY_CLIENT_PATH` (default `./client/index.html`,
  relative to cwd - every documented boot command in this repo runs from
  repo root), css/js/img are resolved as siblings of it, not separately
  configured. same origin as api + ws either way - cors was never about
  file location, only which process serves the response
- scope: the full loop + flavor + retro terminal theme (dark, monospace,
  phosphor green + amber, css scanlines). no framework, no external assets,
  no build step, no bundler
- new public `GET /universe` - client needs stations/routes/goods/constants,
  nothing exposes them yet


verified facts the plan leans on
------------------------------------------------

- routes.js order: `gw.post(json)` → public routes → `gw.use(auth)` →
  authed → 404. new public GETs slot right after `gw.post(json)`
- `rs.file(path)` streams, content-type from extension, self-404s.
  ws upgrades bypass the router (`server.on('upgrade')`) - `GET /` and
  `ws://host/?token=` coexist on the same path
- gateway's own config (`secret`, `ttl`, `timeout`, `ping`, `port`) all
  flow `opt.x ?? readEnv(...)` in `main.js`'s `start()`, then get passed
  as explicit params into `createRoutes`/`createFeed` - `routes.js` never
  calls `readEnv` itself. the client path follows the same shape
- `universe.link(a, b)` stores both directions → 3 links = 6 directed
  routes. `Universe` holds Maps - hand-serialize
- `cargo.loaded/unloaded.v1` quantity is the trade **delta** - client
  mutates cargo locally
- `wallet.debited/credited.v1` carry `balance` - no refetch.
  `ship.departed.v1` carries `arrives` iso - countdown needs no math
- eslint targets `*.js`, tsc skips html - inline client js is invisible
  to both gates, no config changes
- pg numerics arrive as strings - `Number()` at every client ingest point


1 · gateway: two public routes
------------------------------------------------

- `apps/gateway/package.json` + `"@theseus/domain": "*"`, `npm i`
- `apps/gateway/src/main.js` - inside `start(client, opt)`, next to the
  other `opt.x ?? readEnv(...)` lines:
  `const clientPath = opt.clientPath ?? readEnv('GATEWAY_CLIENT_PATH', './client/index.html')`,
  then thread it into `createRoutes({ producer, jwt, queries, waiter, service, clientPath })`
- `apps/gateway/src/routes.js` - import `readEnv`, `{ universe, goods, starterShip }`;
  `createRoutes({ ..., clientPath })` destructures the new param; module
  const next to `BODY_LIMIT` (no `fileURLToPath`/`import.meta.url` needed -
  the default is already a plain cwd-relative string):

```js
const UNIVERSE = {
    stations : [ ...universe.nodes.values() ],
    routes   : [ ...universe.edges ].flatMap(([ from, m ]) =>
                   [ ...m ].map(([ to, ly ]) => ({ from, to, ly }))),
    goods,
    starter  : starterShip,
    constants: {
        time_scale   : readEnv('TIME_SCALE', 20),
        interest_rate: readEnv('INTEREST_RATE', 0.05),
        currency     : '₢',
    },
}
```

- register after `gw.post(json)`, before `POST /register`:
  `gw.get('/', (rq, rs) => rs.file(clientPath))` and
  `gw.get('/universe', (rq, rs) => rs.json(200, UNIVERSE))`
- `types/routes.d.ts` doc comment mentions both; `RoutesInput` gains `clientPath: string`
- `.env.example`: add `GATEWAY_CLIENT_PATH=`
- `.env`: add `GATEWAY_CLIENT_PATH=./client/index.html` (spelled out
  explicitly for discoverability, matching how `GATEWAY_PORT=3000` is
  set even though the code has a fallback)

specs in `test/gateway.spec.js` (no bearer - that IS the public assertion):
- `GET /` → 200, `text/html`, body matches `/theseus/i`
- `GET /style.css` `/app.js` → 200, `text/css` / `javascript` content-type
- `GET /universe` → 200, 3 stations, 6 routes, `goods.ore.name`,
  `starter.stid === 'sol.outpost'`, `constants.time_scale === 20`


2 · the files - client/index.html + css/js/img module graph
------------------------------------------------

markup in `index.html` links `css/style.css` and loads `js/app.js` as a
native ES module (`<script type="module">`) at the end of `<body>`. app.js
is a slim entry point - `Sync` setup + all `addEventListener` wiring + boot
- that imports the rest of the client from sibling modules, each named
after the concern it owns: `dom.js` ($, $.of, esc, raw, format helpers),
`state.js` (the state object + station/good lookups), `feed.js`
(feedLine/mark), `api.js` (api/logout/showAuth/refreshMarket - grouped
together to avoid an import cycle, see below), `map.js` (the NAV panel's
SVG universe map), `render.js` (every other panel render + the eta/marker
tick), `events.js` (flavor/mutate/dispatch), `session.js` (register/login/
enterGame/hydrate/connect), `commands.js` (send/travel/buy/sell). Served by
the gateway's `GET /pub/:file(.*)` (a directory route, not one hardcoded
route per file - see `apps/gateway/readme.md`), same as `css/style.css`
and `img/favicon.svg`. Every module that touches wire-format fields
(`event_type`, `price_unit_max`, `years_abs`, ...) opens with
`/* eslint-disable camelcase */` - matching every server file - since the
disable comment doesn't carry across module boundaries.

### markup

header (brand + blinking cursor, `#conn` ONLINE/OFFLINE, handle, logout) ·
`#auth` "DOCKING CLEARANCE" (handle/password, REGISTER / LOGIN) ·
`#game` css grid: WALLET · SHIP · NAV · MARKET · CARGO · LEDGER · FEED
(full-width scrolling event log) · `#tradeDialog`, a native `<dialog>`
outside the grid, opened from a market row's buy/sell button

### state - one object

```js
{ token, me, universe, ship, cargo: [], market: [], trades: [],
  pending: new Map,   // correlation_id → { label, el }
  ws, wsTries, alive }
```

token in `localStorage('theseus.token')` - auto-login on reload.

### helpers

`$` · `esc` (xss guard on handle/reasons) · `cr(n)` = `'₢' + Number(n).toFixed(2)` ·
`api(path, body?)` fetch + bearer, **401 → logout('session expired')**,
non-2xx → throw `body.error` · `feedLine(kind, text)` append, cap 200,
autoscroll-if-at-bottom, returns the element · `station(stid)` / `good(gid)`

### auth

register → 201 auto-login / 409 message / 202 "queued" + one delayed login
retry. login → token stored → enterGame. logout clears all, `alive = false`
stops the reconnect loop.

### hydrate

`/me` retried ~20 × 500ms ("syncing…" - projection lag after register),
`/universe` once, `/ships` → `ships[0]`, `/cargo/:sid`,
`/market/:stid` when docked, `/trades` → renderAll.

### ws

`new WebSocket(proto + location.host + '/?token=' + token)` ·
onmessage → dispatch(JSON.parse) · onclose → backoff `min(1s·2^n, 10s)` →
hydrate + reconnect (stale token dies at `/me` 401 → logout kills the loop).
browser auto-pongs server pings.

### dispatch - event → state → render

raw feed line first; `pending.get(correlation_id)` line marked ✓/✗; then:

| event                          | mutation → render                                        |
|--------------------------------|----------------------------------------------------------|
| `ship.created.v1`              | set ship, refetch /ships → ship/nav/market               |
| `ship.departed.v1`             | transit, from/to/arrives/years, market=[] → ship/nav/market |
| `ship.arrived.v1`              | docked at stid, fetch /market/:stid → ship/nav/market    |
| `cargo.loaded/unloaded.v1`     | upsert ± delta, drop ≤ 0 → cargo                         |
| `market.trade.executed.v1`     | trades.unshift → ledger                                  |
| `wallet.debited/credited.v1`   | `me.balance = Number(balance)` → wallet                  |
| `market.price.changed.v1`      | upsert if current station → market                       |
| `*.rejected.v1`                | feed err line only                                       |

departed feed flavor: `you age ${years_rel}yr, the galaxy ages ${years_abs}yr`

### commands

`send(path, body, label)` → amber `→ label …` feed line, 202
`correlation_id` into pending. travel `{ sid, from: ship.stid, to }` ·
trade `price_unit_max = price_buy · 1.1` / `price_unit_min = price_sell · 0.9`
(headroom for price drift between quote and execution - the dialog itself
shows and sends plain `price · quantity`). market rows (and so the trade
buttons) only exist while `status === 'docked'` - nothing to click otherwise.

### render

per-panel `renderX()` → innerHTML of `*Body` divs; `#tradeDialog` is a
sibling of `#game`, never touched by `renderMarket()`'s re-render, so it
keeps whatever the user's mid-typing (input preservation). each market row
gets a buy and a sell `<button data-gid data-side>` showing that price;
cargo rows get a sell button only (same `tradeBtn()` helper, station's
`price_sell` for that gid, docked only - no button for a good the
station doesn't quote). one delegated click listener on `#game` (not
`#marketBody`/`#cargoBody` separately) catches every `.tradeBtn` →
`openTradeDialog(side, gid)` sets the title/qty/total and `showModal()`s
it, qty input live-updates the total, confirm → `commands.js`'s
`confirmTrade()` reads the dialog's own `dataset` and closes it. NAV is an inline SVG map
(`map.js`) - stations laid out on a generated circle (no coordinate data
exists or is stored; layout is computed from station count, not hardcoded),
routes as lines with `ly` labels, current station marked `.here`, reachable
stations `.reachable` (clickable, `travel(stid)`) with the old ly/eta/age/
capital-cost preview now on a native `<title>` hover tooltip instead of
button text. countdown + ship-marker position share one
`setInterval(tick, 250)`: `#eta` text from `arrives − now`, clamped to
"arriving…"; marker position from `arrives`/`years_abs`/`time_scale`
(derived transit-start instant, no separate "departed at" field needed) via
a CSS `transition` on the marker's `cx`/`cy` for a smooth glide between
ticks. Never flips state locally, waits for `ship.arrived.v1`.

### theme

css vars `--bg #070a07 · --fg #33ff66 · --amber #ffb000 · --err` ·
phosphor text-shadow · `body::after` repeating-gradient scanlines +
`::before` vignette (pointer-events none) · bordered panels with
`── HEADING ──` · transparent uppercase buttons, hover invert ·
money + countdown amber · feed color-coded err/dim/cmd/ok


3 · edge cases
------------------------------------------------

401 anywhere → logout w/ message · ws 401 → close → hydrate → logout
(no spin) · register 202 → delayed login retry then manual · /me 404 lag →
retry loop · no ship yet → "awaiting ship commission…", fixed by
`ship.created.v1` · transit on reload → countdown from /ships row ·
countdown 0 → clamp, wait for event · empty market/cargo/trades →
explicit copy · multiple ships → `ships[0]` defensively


4 · order + verify
------------------------------------------------

1. routes + deps + `GATEWAY_CLIENT_PATH` env + placeholder html + d.ts comment
   → `npm run lint && npm run tsc`
2. two specs → `npm test` green (coverage gate needs both handlers)
3. css + markup + auth + api + hydrate + renders (no ws) → boot infra +
   4 services + gateway, open localhost:3000, register/login, panels
   populate; curl a buy, reload, confirm
4. ws wiring (connect/dispatch/pending/backoff/ticker/send) → play the
   loop in-browser; kill/restart gateway → reconnect + rehydrate;
   `scripts/ws-probe.js` to cross-check
5. flavor polish: years copy, eta/cost previews, disabled/empty states
6. docs: gateway readme (routes + layout + client section), progress.md
   (step-9 checklist; **fix heading drift** - progress says "step 8" where
   phase.1 says 9), phase.1.md (9 → done, [10] → current)
7. `npm run check` + final manual playthrough of the success-criteria list


5 · accepted risks
------------------------------------------------

- `INTEREST_RATE` env is new, only the client preview reads it - keep the
  0.05 default aligned if server-side capital cost ever lands
- no pending-command timeout - lost command leaves a `…` feed line
- `rs.file` sends no cache headers - fine for a handful of dev-stage files
- roles (permissions.md "plumb before client") deliberately deferred -
  client treats a missing role claim as player, nothing to unwind later
