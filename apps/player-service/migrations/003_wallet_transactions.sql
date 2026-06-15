create table wallet_transactions (
    rfid text primary key,
    pid text not null,
    type text not null,
    amount numeric not null,
    created timestamp default now()
)