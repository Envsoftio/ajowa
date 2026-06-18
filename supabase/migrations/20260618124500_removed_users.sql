alter table users
  add column if not exists deleted_at timestamptz;

create index if not exists users_deleted_at_idx on users (deleted_at);
