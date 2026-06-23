create table society_email_settings (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete cascade,
  enabled boolean not null default false,
  smtp_host text not null default '',
  smtp_port integer not null default 587,
  smtp_user text not null default '',
  from_email citext not null default '',
  from_name text not null default '',
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (society_id),
  check (smtp_port between 1 and 65535)
);

create trigger society_email_settings_set_updated_at
  before update on society_email_settings
  for each row
  execute function set_updated_at();
