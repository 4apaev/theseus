-- one row per message, a dm or a station chat line. deliver and
-- delivered mirror ships.arrives and ships.arrived - see
-- docs/ansible.md. station chat sets delivered at insert time. it
-- has no delay to wait out.
create table messages (
    mid       text primary key,
   "from"     text not null,
   "to"       text,          -- null for station chat
    stid      text,          -- station chat only, null for a dm
    body      text not null,
    sent      timestamp not null default now(),
    deliver   timestamp not null,
    delivered timestamp
)
