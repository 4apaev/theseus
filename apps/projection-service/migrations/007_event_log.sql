create table event_log (
    eid         text primary key,
    event_type  text not null,
    payload     jsonb not null,
    occurred    timestamp not null,
    received    timestamp default now()
)
