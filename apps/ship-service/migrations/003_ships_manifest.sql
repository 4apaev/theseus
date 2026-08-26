alter table ships
    add column manifest text[] not null default '{}'
