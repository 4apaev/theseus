🚀 theseus 📺 projection-service
================================================================


first running service.
----------------------------------------------------------------
- disposable read models - read models can be rebuilt from scratch by replaying events.
- builds read models from all events.
- gives live visibility
- validates the event structure early.


event ordering
----------------------------------------------------------------
events are processed in order, but there can be race conditions
or out of order delivery. if we have `FK` constraints, a `wallet.created`
might arrive before `player.created` (unlikely but possible),
which would cause a `FK` violation. even though the data is logically consistent.

rebuild / replay
----------------------------------------------------------------
when truncate and replay events, `fk` constraints
force careful  table ordering during truncation.

source of truth is the write side.
----------------------------------------------------------------
referential integrity is enforced there (can't create a wallet
for a non-existent player at command time).

rebuild resilience
----------------------------------------------------------------
the projection just mirrors what already passed validation.
query time guarantees (e.g. JOIN safety), indexes on the reference
columns (pid, sid, stid) are enough without the constraint overhead.