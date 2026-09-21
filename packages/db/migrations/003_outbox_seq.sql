/*  created holds now(), the transaction start time, and that value
    repeats. two rows for the same aggregate can tie, and the publish
    order then falls to postgres. a sequence rises with every insert,
    so it gives the batch a total order. */
alter table outbox add column if not exists seq bigserial;

create index if not exists outbox_pending_seq
    on outbox (seq) where published is null;
