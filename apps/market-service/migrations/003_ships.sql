-- mirror of ship-service state, built from events.ship
create table ships (
    sid         text    primary key,
    pid         text    not null,
    stid        text,
    status      text    not null default 'docked',
    capacity    integer not null
)
