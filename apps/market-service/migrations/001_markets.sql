-- quote board: written on every stock change,
-- read by gateway / rebuild, never by the sagas
create table markets (
    stid        text    not null,
    gid         text    not null,
    price_buy   numeric not null,
    price_sell  numeric not null,
    updated     timestamp,
    primary key (stid, gid)
)
