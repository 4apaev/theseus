-- source of truth: sagas select ... for update here,
-- prices are always computed from the locked stock row
create table station_inventory (
    stid        text    not null,
    gid         text    not null,
    stock       integer not null default 0,
    target      integer not null default 100,
    updated     timestamp,
    primary key (stid, gid)
)
