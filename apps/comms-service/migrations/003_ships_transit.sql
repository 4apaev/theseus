-- from/to hold a transiting ship's current edge. the ansible signal
-- starts at whichever end sits closer to its target.
-- 001 declares the same 2 columns. a database that applied 001 before
-- they existed never gets them, because migrate.js keys
-- schema_migrations by file name.
alter table ships
    add column if not exists "from" text,
    add column if not exists "to"   text
