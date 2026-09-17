-- mirror of ship-service state, from events.ship and ship.rig.changed.
-- stid holds a docked ship's station. from/to hold a transiting
-- ship's current edge - the ansible signal starts at whichever end
-- is closer to its target. see handlers.js's candidates().
create table ships (
    sid         text    primary key,
    pid         text    not null unique,
    stid        text,
   "from"       text,
   "to"         text,
    status      text    not null default 'docked',
    has_ansible boolean not null default false
)
