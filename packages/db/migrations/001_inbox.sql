create table inbox (
    eid     text primary key,
    created timestamp default now()
);
