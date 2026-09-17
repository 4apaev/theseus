-- read model for comms-service's messages.
-- message.sent inserts the row. message.delivered marks it delivered.
-- station chat has no delay. its row lands already delivered.
-- see queries.js's messageSent.
create table messages (
    mid       text    primary key,
   "from"     text    not null,
   "to"       text,
    stid      text,
    body      text    not null,
    sent      timestamp not null,
    deliver   timestamp not null,
    delivered timestamp
)
