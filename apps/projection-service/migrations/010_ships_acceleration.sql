-- mirrors ship.acceleration, in m/s². the gateway reads it for the
-- client eta preview.
-- the default matches the starter hull base, so it backfills
-- every existing ship correctly.
alter table ships
    add column acceleration numeric not null default 0.002
