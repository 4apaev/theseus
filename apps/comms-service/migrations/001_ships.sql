-- mirror of ship-service state, from events.ship and ship.rig.changed.
-- comms-service needs only 2 facts: where a ship is docked, and
-- whether it carries a fitted transceiver.
create table ships (
    sid         text    primary key,
    pid         text    not null unique,
    stid        text,
    status      text    not null default 'docked',
    has_ansible boolean not null default false
)
