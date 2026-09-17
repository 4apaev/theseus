-- in-system acceleration, in m/s². the hull and the fitted maneuver
-- drive set it. travel.js reads it for a brachistochrone leg.
-- the default matches the starter hull base, so it backfills
-- every existing ship correctly.
alter table ships
    add column acceleration numeric not null default 0.002
