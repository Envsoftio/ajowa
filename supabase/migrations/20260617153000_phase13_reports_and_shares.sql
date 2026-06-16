alter table shared_report_links
  add column if not exists flat_id uuid references flats(id) on delete restrict,
  add column if not exists note text,
  add column if not exists delivery_failure text,
  add column if not exists delivered_at timestamptz,
  add column if not exists consumed_at timestamptz,
  add column if not exists revoked_reason text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists shared_report_links_society_status_idx
  on shared_report_links (society_id, expires_at, revoked_at, consumed_at);

create index if not exists shared_report_links_owner_period_idx
  on shared_report_links (society_id, owner_user_id, report_type, start_date, end_date);

create index if not exists shared_report_links_flat_id_idx
  on shared_report_links (flat_id);

drop trigger if exists shared_report_links_set_updated_at on shared_report_links;
create trigger shared_report_links_set_updated_at
  before update on shared_report_links
  for each row execute function set_updated_at();
