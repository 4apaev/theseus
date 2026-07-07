create table cargo (
    sid         text    not null,
    gid         text    not null,
    quantity    integer not null default 0,
    updated     timestamp,
    primary key (sid, gid)
)
