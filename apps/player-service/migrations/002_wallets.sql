create table wallets (
    pid     text    primary key,
    balance numeric not null default 0,
    version integer not null default 1
)
