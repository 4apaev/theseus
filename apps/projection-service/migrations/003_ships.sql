create table ships (
    sid         text primary key,
    pid         text not null,
    stid        text not null,
    name        text not null,
    status      text not null default 'docked',
    capacity    integer not null,
    velocity    numeric not null,
    "from"      text,
    "to"        text,
    departs     timestamp,
    arrives     timestamp,
    arrived     timestamp,
    years_abs   numeric,
    years_rel   numeric,
    updated     timestamp
)