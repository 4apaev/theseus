deploy
================================================

what it takes to run theseus for other people, and what the bill looks
like. sizing comes from the measured numbers in [sim.md](sim.md).

nothing here is built yet. `docs/tech.debt.md` tracks the gaps.


what has to run
------------------------------------------------

**6 node processes**, all stateless except for their postgres schema:

| process | owns | scales |
|---------|------|--------|
| gateway | nothing | horizontally, once the websocket fanout is shared |
| player-service | players, wallets | one per consumer group |
| ship-service | ships, modules | one per consumer group |
| market-service | markets, cargo, trades | one per consumer group |
| comms-service | messages | one per consumer group |
| projection-service | read models | one per consumer group |

**2 stateful parts**: postgres 17, and kafka 3.9 in kraft mode. 13
topics, 6 for commands and 7 for events.

kafka-ui and pgadmin are dev tools. they do not ship.


the gaps that block a deploy
------------------------------------------------

1. **no container image.** `scripts/start.sh` runs 6 `node` processes
   with `--env-file`. a deploy needs one image per service, or one image
   with a command per service.
2. **no health endpoint.** `scripts/services-check.js` reads pidfiles.
   an orchestrator needs http, or a container-native probe.
3. **one gateway only.** the websocket fanout lives in one process's
   memory (`apps/gateway/src/feed.js`). a second gateway splits the
   fanout, and half the players stop getting events. fix that before
   scaling the edge.
4. **no backups.** postgres holds every write model. kafka holds the
   events, so a replay rebuilds the projections - it does not rebuild
   `player.players` or `ship.ships`.
5. **no logger and no metrics.** `console.log` into a file.
6. **secrets in `.env`.** `JWT_SECRET` and the postgres password ship in
   plain text.

`market.ships` never replays (see [progress.md](progress.md)), so a lost
postgres is a lost game even with kafka intact. backups are not optional.


the prune job
------------------------------------------------

`npm run db:prune` deletes published outbox rows and old inbox rows
across all 5 schemas. it keeps 7 days by default, `PRUNE_DAYS` or
`--days` to change it, `--dry` to count first.

this matters more than it sounds. **inbox and outbox are 59% of the
database's growth**, and neither was ever cleaned. an outbox row is a
publish that already happened; an inbox row guards against a duplicate
the broker can no longer send.

keep the window longer than the broker's retention. cron it daily.

an unpublished outbox row is never deleted. it is work in hand.


how much data
------------------------------------------------

measured: **11.3 rows and 4.7 KB of postgres per command**, and about
**3.25 kafka records per command** at roughly 750 bytes each.

a player at 2 hours a day, 2-3 days a week, is 260 hours a year. at 60
commands an hour:

| players | commands/yr | postgres/yr | pruned | kafka/yr |
|---------|-------------|-------------|--------|----------|
| 100 | 1.6M | 7 GB | 3 GB | 3.5 GB |
| 1000 | 15.6M | 70 GB | 29 GB | 36 GB |
| 3000 | 46.8M | 209 GB | 86 GB | 106 GB |

kafka is before replication. at rf=3 it triples.

halve the command rate and halve every number. the mix matters too - the
sim sends a message on 8 turns in 100, and messaging was the single
largest table in the measurement.


what the load actually is
------------------------------------------------

read this before the prices. a player sends about one command a minute,
and plays 5 hours a week. spread over a week, and multiplied by 4 for
the evening peak:

| players | avg concurrent | peak | commands/s | rows/s | kafka rec/s |
|---------|----------------|------|------------|--------|-------------|
| 100 | 3 | 12 | 0.2 | 2 | 1 |
| 1000 | 30 | 119 | 2.0 | 22 | 6 |
| 3000 | 89 | 357 | 6.0 | 67 | 19 |

**3000 players is 6 commands a second.** a laptop serves that. the
managed prices below do not buy throughput - they buy redundancy, a
backup someone else runs, and a pager that is not yours.

so treat the shape as a business decision, not a capacity one. the
questions are how long the game may stay down, and how much data may be
lost, not how many players fit.

kafka carries 19 records a second at 3000 players. it is the most
expensive dependency in every quote below, for the least load in the
system. it is here because the project set out to learn it - worth
saying out loud when the invoice arrives.


what it costs to host
------------------------------------------------

list prices, checked 2026-09. **they move - price the shortlist again
before anyone signs.** managed kafka is the line that decides the bill.

### the cheap shape - one box

everything on one server, docker compose as it stands, plus backups.

| where | shape | monthly |
|-------|-------|---------|
| hetzner | CPX41, 8 vcpu, 16 GB, 240 GB | ~$35 |
| digitalocean | 8 GB / 4 vcpu droplet + 250 GB volume | ~$75 |
| aws lightsail | 8 GB instance + block storage | ~$90 |

fits 100 players with room to spare. it is a single point of failure,
and kafka and postgres compete for the same disk. good enough to launch,
not good enough to keep.

### the managed shape

postgres managed, kafka managed, services on small compute.

| part | aws | digitalocean | azure |
|------|-----|--------------|-------|
| postgres | rds db.t4g.medium multi-az, 100 GB - ~$180 | managed pg 4 GB - ~$60 | flexible server d2ds - ~$140 |
| kafka | msk 2× kafka.t3.small - ~$160 | no managed kafka | event hubs standard - ~$75 |
| compute | 2× t4g.small ecs - ~$30 | 2× 2 GB droplets - ~$24 | 2× b2s - ~$60 |
| egress + backups | ~$40 | ~$20 | ~$40 |
| **monthly** | **~$410** | **~$105 + kafka** | **~$315** |

at 1000 players the storage grows but the instances do not - postgres
goes to ~$220 on aws, and the total lands near $500.

at 3000 players plan for a read replica and a 3 broker kafka: aws near
$900, azure near $700.

### what actually drives it

- **managed kafka is half the bill.** digitalocean has none, so that
  column needs a broker on a droplet, or redpanda, or a move to another
  provider.
- **event hubs speaks the kafka protocol**, which is why azure is
  cheaper here. it is not kafka, and the kraft-specific settings in
  `infra/docker-compose.yml` do not apply.
- **the prune job pays for itself.** 209 GB against 86 GB at 3000
  players is real money on managed postgres, every month, forever.
- **egress is the surprise.** a websocket per player, pushing every
  event that player can see, is a steady outbound stream. measure it
  with a real client before trusting any of these numbers.

### a cheaper read

theseus is a turn-based trade game where a busy player sends one command
a minute. that is not a lot of load. the honest shape for a first
launch is one box at ~$35-75 a month, with managed postgres added the
day the game has players worth losing.


what to build first
------------------------------------------------

1. a `Dockerfile` and a compose file that runs the 6 services, not just
   the infra
2. `GET /health` on the gateway, and a real probe per service
3. daily `pg_dump` to object storage, and a restore that someone has
   actually run
4. the prune job on a cron
5. a logger with levels, and one metrics endpoint
6. secrets out of `.env`

then measure again. every number above comes from a 6 player sim, and a
real player is not a dice roll.
