create table trade_history (
    tid         text    primary key,
    gid         text    not null,
    pid         text    not null,
    sid         text    not null,
    stid        text    not null,
    quantity    integer not null,
    price_total numeric not null,
    price_unit  numeric not null,
    side        text    not null,
    created     timestamp default now()
)
