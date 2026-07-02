alter table service_requests
  add column if not exists idempotency_key text;

create unique index if not exists service_requests_idempotency_key_idx
  on service_requests (idempotency_key)
  where idempotency_key is not null;
