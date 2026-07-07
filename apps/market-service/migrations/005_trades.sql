-- saga state machine: pending → executed | rejected
create table trades (
    tid         text    primary key,
    pid         text    not null,
    sid         text    not null,
    stid        text    not null,
    gid         text    not null,
    side        text    not null,
    status      text    not null default 'pending',
    quantity    integer not null,
    price_unit  numeric not null,
    price_total numeric not null,
    created     timestamp default now(),
    updated     timestamp
)
