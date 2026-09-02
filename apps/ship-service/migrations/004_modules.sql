-- no existing row to backfill - infra was wiped clean before phase 3.3
-- landed, so every ship from this point on is born with a hull and a rig
alter table ships
    add column hull text    not null, -- hull id
    add column rig  integer not null; -- rig version

-- one row per fitted slot. a slot missing here is an empty slot.
-- replaced wholesale from a module_operations snapshot on every refit -
-- see docs/modules.md's "ship-service fitting saga"
create table fitted_modules (
    sid     text not null references ships (sid),
    slot    text not null, -- module slot
    gid     text not null, -- module good id
    fitted  timestamp not null default now(),
    primary key (sid, slot)
);

-- one row per install/remove request - the saga's own state machine,
-- pending -> done | rejected. oid rides the wire as `operation` on
-- every command/event in the saga, so market-service and the client
-- can correlate a reply without knowing ship-service's own schema.
-- proposed/stats are previewRig()'s own output, stored verbatim.
create table module_operations (
    oid            text primary key, -- operation id
    pid            text not null,    -- player id
    sid            text not null references ships (sid),
    slot           text not null,       -- module slot
    type           text not null,       -- install | remove
    incoming       text,                -- inc good
    outgoing       text,                -- out good
    proposed       jsonb not null,      -- the full proposed { slot: gid }
    stats          jsonb not null,      -- previewRig()'s derived stats
    status         text not null default 'pending',
    causation_id   text,
    correlation_id text,
    created        timestamp default now(),
    updated        timestamp
);

-- the doc's rule: one pending refit per ship, not one per slot -
-- dependencies, power and cargo capacity are ship-wide
create unique index module_operations_one_pending_per_ship
    on module_operations (sid)
    where status = 'pending'

