-- durable, append-only - every consumed message, replay source for
-- scripts/rebuild-market-ships.js. same shape as projection-service's
-- own event_log
create table event_log (
    eid         text primary key,
    etype       text not null,
    payload     jsonb not null,
    occurred    timestamp not null,
    received    timestamp default now()
)
