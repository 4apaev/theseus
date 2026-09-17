-- one row per line: a message, or a chat line. deliver and
-- delivered mirror ships.arrives and ships.arrived - see
-- docs/ansible.md. chat sets delivered at insert time. it
-- has no delay to wait out.
create table messages (
    mid       text primary key,
   "from"     text not null,
   "to"       text,          -- null for chat
    stid      text,          -- chat only, null for a message
    body      text not null,
    sent      timestamp not null default now(),
    deliver   timestamp not null,
    delivered timestamp
)
