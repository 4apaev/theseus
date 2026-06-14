create table wallets (
    pid     text      primary key,
    balance numeric   not null default 0,
    updated timestamp
)
