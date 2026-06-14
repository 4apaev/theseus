create table players (
    pid     text      primary key,
    handle  text      not null,
    created timestamp default now()
)
