-- ship.created.v1 always carries all 4 - no backfill, no default
alter table ships
    add column hull       text    not null,
    add column rig        integer not null,
    add column power      integer not null,
    add column power_pool integer not null;

-- one row per fitted slot, replaced wholesale on every ship.rig.changed
create table fitted_modules (
    sid  text not null,
    slot text not null,
    gid  text not null,
    primary key (sid, slot)
)
