create table outbox (
    id        text primary key,
    topic     text not null,
    key       text,
    payload   jsonb not null,
    created   timestamp default now(),
    published timestamp
);
