create table ships (
    sid         text primary key,
    pid         text not null,
    stid        text not null,
    name        text not null,
    status      text not null default 'docked',
    "from"      text,
    "to"        text,
    capacity    integer not null,
    velocity    numeric not null,
    departs     timestamp,
    arrives     timestamp,
    arrived     timestamp,
    updated     timestamp,
    created     timestamp default now()
)