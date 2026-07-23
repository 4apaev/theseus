client - the plan
================================================


step `9` in [phase.1.md](phase.1.md) - minimal client: **html + css + js,
websocket-driven**. status: done ✔.

closes the phase-1 success criteria: register, get a ship, trade, travel,
and see it all update live - through a browser. first real consumer of the
gateway api.

decisions:
- lives at top-level `client/` (`index.html` + `style.css` + `app.js`) -
  not nested in the gateway app, not an npm package (no deps, nothing
  imports it). served by three public GETs via garage `rs.file()`; the
  html's path comes from `GATEWAY_CLIENT_PATH` (default `./client/index.html`,
  relative to cwd - every documented boot command in this repo runs from
  repo root), css/js are resolved as siblings of it, not separately
  configured. same origin as api + ws either way - cors was never about
  file location, only which process serves the response
- scope: the full loop + flavor + retro terminal theme (dark, monospace,
  phosphor green + amber, css scanlines). no framework, no external assets -
  three local files, no build step, no bundler
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


2 · the files - client/index.html + style.css + app.js
------------------------------------------------

markup in `index.html` (~120 lines) links `style.css` (~130) and loads
`app.js` (~370) at the end of `<body>`, same execution timing as an inline
`<script>` would have. `<link rel="icon" href="data:,">` silences the
favicon 401. `app.js` opens with `/* eslint-disable camelcase */` -
matching every server file - since it mirrors wire field names
(`event_type`, `price_unit_max`, `years_abs`, ...) verbatim.

### markup

header (brand + blinking cursor, `#conn` ONLINE/OFFLINE, handle, logout) ·
`#auth` "DOCKING CLEARANCE" (handle/password, REGISTER / LOGIN) ·
`#game` css grid: WALLET · SHIP · NAV · MARKET (+ static trade form) ·
CARGO · LEDGER · FEED (full-width scrolling event log)

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
buy `price_unit_max = price_buy · 1.1` · sell `price_unit_min = price_sell · 0.9`.
all action buttons disabled unless `status === 'docked'`.

### render

per-panel `renderX()` → innerHTML of `*Body` divs; the trade form is static
dom, never re-rendered (input preservation). NAV lists
`routes.filter(r => r.from === ship.stid)` with `ly · eta preview`
(`abs = ly/v` · `rel = abs·√(1−v²)` · `secs = abs·time_scale`) + capital
cost one-liner via `interest_rate`. countdown: one `setInterval(tick, 250)`
writing only `#eta` from `arrives − now`, clamped to "arriving…" - never
flips state locally, waits for `ship.arrived.v1`.

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
- `app.js` isn't in eslint's `files` glob yet (would need browser globals
  added alongside `apps/**`'s node globals) - unlinted/untyped for now,
  manual browser verification, keep it boring
- `rs.file` sends no cache headers - fine for three dev-stage files
- roles (permissions.md "plumb before client") deliberately deferred -
  client treats a missing role claim as player, nothing to unwind later
