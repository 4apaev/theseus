create table market_prices (
    stid        text    not null,
    gid         text    not null,
    price_buy   numeric not null,
    price_sell  numeric not null,
    updated     timestamp,
    primary key (stid, gid)
)
