ansible
================

mechanics design for phase 3 step 3.4. see [phase.3.md](phase.3.md) and
[game.md](game.md)'s "player 2 player communications" idea. this
document plans the work. it does not do any of it.

game.md's own words: "some kind of ansible device that enables faster
than light speed coms. but still with delay, no instant transfer."


the ask
--------------------------------

a player must send a message to another player. the message must not
arrive instantly. the delay must depend on distance.

step 2.3 already made ship traffic and station presence public. this
step adds the missing half: talk to the people you can already see.


scope
--------------------------------

2 message kinds. not 1.

- **station chat.** instant. every player docked at the same station
  sees it. cheap: the presence data already exists.
- **ansible message.** private. player to player. delayed by distance.
  the delay is the whole point of the idea.


station chat
--------------------------------

a player sends a message with no recipient, only a station id. every
socket whose player is docked at that station receives it right away.
no delay, no queue, no persistence beyond the log.

the client does not need a new presence system. `traffic.js`'s
`dockedAt()` already answers "who else is here". station chat reuses
that same fact on the server.

the gateway does not query a database to find who is docked where.
it watches the same `events.ship` stream `feed.js` already consumes,
and keeps one small map in memory: pid → current stid. `ship.created`,
`ship.departed`, and `ship.arrived` update the map. `ship.departed`
clears the stid until the next arrival. a reconnect rebuilds nothing -
the map is a cache of events already flowing through the process, not
a source of truth.


the ansible message
--------------------------------

### the delay

the delay must grow with distance, and must never be instant across
the whole galaxy. it must also never make a short chat feel like an
email.

a new constant, `ANSIBLE_SPEED`, lives next to `TIME_SCALE` and
`SUBLIGHT` in `packages/domain/src/universe.js`, env-backed the same
way. `ANSIBLE_SPEED` is a multiple of light speed, far faster than any
ship, but not infinite.

delay = distance in light years ÷ `ANSIBLE_SPEED`, converted to real
milliseconds the same way `travel()` already converts a ship's transit
time, through `TIME_SCALE`.

distance is 0 when sender and recipient share one station. the message
still queues and still delivers through the same poll, just with no
wait.

### a new distance function

`universe.path()` finds the fastest route for a given ship. its
dijkstra search weights each edge by travel time, `ly ÷ min(velocity,
c)`. a slow ship and a fast ship can take different routes to the same
place.

an ansible signal is not a ship. it does not slow down near a star,
and it does not care which ship asked. it needs the shortest physical
route, weighted by light years alone.

add a `distanceTo(from, to)` method on `Universe`: the same dijkstra shape as the
existing shortest-time search, but weighted by `edge.ly` only, with no
velocity argument. it returns the total light-year distance along the
shortest such route, or throws when no route connects the 2 stations,
matching `path()`'s own error style.

this is a new function, not a rewrite. `path()` stays exactly as it
is - ship routing still needs the time-weighted search.

### the hardware

an ansible is fitted comms hardware, decided back in phase.3.md. it is
not an account power. both the sender's ship and the recipient's ship
need a compatible fitted transceiver at the moment the message is
sent. removing the transceiver later does not recall a message already
queued.

today's starter hull has 3 slots: power, cruise, cargo. none of them
fit a transceiver. this step adds a 4th slot family, `comms`, and one
module, `ansible.mk1`, to `packages/domain/src/modules.js`. the
starter hull gains a `comms1` slot, fitted with `ansible.mk1` from
the start - the same "every ship is born with a full rig" rule
step 3.3 already set for hull and hull slots.

this changes the starter rig's shape. it does not need a migration for
old ships - phase 3 has no live players yet, and the project's own
precedent (`ship.created.v1` carrying the full rig from birth, no v2)
already treats a new baseline as free to add before launch.

phase 3's one-ship-per-player rule makes "the sender's ship" and "the
recipient's ship" unambiguous. fleet messaging needs its own addressing
decision later - not this step.


delivery: a poll, not a timer
--------------------------------

this is the same shape `ship-service/src/arrivals.js` already proved
for ship arrivals.

1. `message.send.requested` writes one row with a computed `deliver`
   time - the same role `arrives` plays on a ship in transit.
2. `poll()` from `@theseus/util` - the same primitive `pollArrivals`
   and `pollDrift` already use - claims rows where `deliver <= now()`
   and sets `delivered`, the same role `arrived` plays.
3. claiming a row emits `message.delivered.v1`.

no new delivery mechanism. the ships one, applied to messages.

a restart loses no message. the row already holds its own due time. a
service that comes back late just finds it already due, and delivers
it on the next tick.


the new service
--------------------------------

`apps/comms-service`, its own postgres schema, `comms` - matching how
ship-service and market-service each own exactly one thing.

**table**, `messages`:

| column     | meaning                                          |
|------------|---------------------------------------------------|
| `mid`      | message id                                         |
| `from`     | sender pid                                         |
| `to`       | recipient pid - null for station chat              |
| `stid`     | station id - station chat only, null for a DM      |
| `body`     | the text                                           |
| `sent`     | the send instant                                   |
| `deliver`  | the computed delivery instant                      |
| `delivered`| the actual delivery instant - null until then      |

`from`/`to` stay bare, no underscore - the same short compound-id style
phase 1 already chose for `ships.from`/`ships.to`, just carrying player
ids here instead of station ids.

**commands and events**, new topic `comms`:

- `message.send.requested` → `message.sent` (queued, station chat needs
  nothing more) or `message.send.rejected` (unknown recipient, or a
  missing transceiver on either ship)
- the delivery poll emits `message.delivered` - the ansible case only,
  station chat has no delay to observe

**the send handler**, one transaction:

1. reject an empty body, or a recipient equal to the sender.
2. station chat: look up the sender's current station (the ship
   projection, not the gateway's in-memory map - a command handler
   must not depend on another process's memory). reject if not docked
   anywhere.
3. ansible message: look up both ships' hulls and fitted modules.
   reject if either lacks a fitted comms transceiver. compute distance
   and `deliver` from both ships' current stations.
4. insert the row. emit `message.sent`.


the gateway
--------------------------------

**reads**, owner-scoped:

- `GET /messages` - every message the caller sent or received, and
  every station-chat line from a station the caller currently occupies

**a write**:

- `POST /messages` - publishes `message.send.requested`, `from` taken
  only from the token, exactly like every other authenticated command

**the feed**

`feed.js` today knows 2 audiences: the one owner who sees a full
payload, and everyone else who sees a redacted public shape or
nothing. an ansible message needs a 3rd shape: exactly 2 pids see the
full payload, and nobody else sees anything at all - not even
redacted. add that case: a socket sees a message event in full when
its pid is the sender or the recipient.

station chat needs the pid → stid map described above. a message event
with a `stid` and no `to` goes in full to every socket currently
mapped to that station, and to no one else.

neither message kind gets a public, redacted shape. a conversation is
not ship traffic.


the client
--------------------------------

a messages panel, already sketched and never built, in `client.md`'s
old layout mockup. it needs:

- a station-chat log, scoped to the current station, live while docked
- a direct-message thread per other player, with a queued/delivered
  mark matching the same pending-command pattern `commands.js`
  already uses for trades and travel


privacy
--------------------------------

matches [permissions.md](permissions.md)'s existing model exactly.

- station chat is public to the station, the same shape already used
  for who is docked where. a stranger elsewhere sees nothing.
- a direct message reaches only its 2 participants - the same
  owner-only routing `feed.js` already gives private ship and wallet
  events, extended to 2 owners instead of 1.


delivery sequence
--------------------------------

### 1. domain

add the `comms` module family and `ansible.mk1` to
`packages/domain/src/modules.js`. add the `comms1` slot to the starter
hull. add `ANSIBLE_SPEED` next to `TIME_SCALE`. add `Universe`'s new
`distanceTo` method. cover all 4 in `test/domain.spec.js`.

### 2. contracts

add the `message.send.requested`, `message.sent`, `message.delivered`,
and `message.send.rejected` schemas, the `comms` topic, and the
command/event tree entries. cover valid and invalid envelopes in
`test/contracts.spec.js`.

### 3. comms-service

scaffold `apps/comms-service`: migrations, the send handler, the
delivery poll, `main.js`'s `Service` subclass. test the handler and the
poll in isolation, the same fake-client shape every other service's
unit tests already use.

### 4. gateway

add the owner-scoped read and the send route. add the 2 new feed
shapes: 2-pid-only for a direct message, station-scoped for chat. keep
both off the public allowlist.

### 5. client

build the messages panel. wire station chat and direct messages to the
existing pending-command and feed-dispatch patterns.

### 6. end-to-end proof

exercise the real loop:

1. 2 players dock at the same station, chat, both see it live.
2. one player travels away. the two chat again - nothing arrives for
   either, they are no longer at the same station.
3. one player sends an ansible message to the other, across a real
   distance. it does not arrive immediately.
4. the poll delivers it once its `deliver` time passes. the recipient
   sees it, the sender sees it marked delivered.
5. a player with no fitted transceiver tries to send one - rejected.
6. a projection rebuild changes nothing here - comms-service owns its
   own table, the same as market-service's cargo and trades stay
   outside a rebuild.


test matrix
--------------------------------

- `test/domain.spec.js` - `ANSIBLE_SPEED`, `distanceTo`, the new
  module and slot
- `test/contracts.spec.js` - every new payload and rejection shape
- a new `test/comms.spec.js` - send rejections, the delivery poll,
  0-delay same-station messages
- `test/gateway.spec.js` - the 2-pid-only feed shape, the station-scoped
  feed shape, ownership on both new routes
- a new `test/comms.integration.spec.js` - a real send-then-deliver
  round trip against real postgres
- extend `test/game.integration.spec.js` or add a sibling: 2 players,
  a station chat line, then a real delayed ansible message


done when
--------------------------------

- station chat reaches every player at the station, and no one else
- an ansible message never arrives before its computed delivery time
- distance 0 (same station) still queues and still delivers, with no
  wait
- neither ship needs a fitted transceiver to receive station chat -
  only an ansible message needs one, on both ends
- a message event reveals its content to its participants only - never
  a redacted public copy
- a service restart delivers a message exactly once, never twice, and
  never zero times
- the full validation gates pass: `npm run lint`, `npm run tsc`,
  `npm test`, `npm run test int`, `npm run smoke`
