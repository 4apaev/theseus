create table players (
    pid         text      primary key,
    handle      text      not null unique,
    hash        text      not null,
    created     timestamp default now()
)
