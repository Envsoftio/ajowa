alter type notification_event_status add value if not exists 'DRAFT';
alter type notification_event_status add value if not exists 'SCHEDULED';
alter type notification_event_status add value if not exists 'SENT';
alter type notification_event_status add value if not exists 'DELIVERED';
alter type notification_event_status add value if not exists 'READ';

alter type notification_job_status add value if not exists 'PROCESSING';

alter type delivery_status add value if not exists 'CLICKED';

alter table notices
  add column if not exists attachment_file_id uuid references stored_files(id) on delete set null,
  add column if not exists attachment_label text,
  add column if not exists audience_filter jsonb not null default '{}'::jsonb,
  add column if not exists notification_event_id uuid references notification_events(id) on delete set null;

alter table notification_events
  add column if not exists scheduled_for timestamptz,
  add column if not exists audience_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists channel_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists template_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists idempotency_window_seconds integer not null default 86400,
  add column if not exists cancelled_at timestamptz,
  add column if not exists completed_at timestamptz,
  add constraint notification_events_idempotency_window_chk
    check (idempotency_window_seconds > 0);

alter table notification_audiences
  add column if not exists target_user_status text,
  add column if not exists target_flat_label text,
  add column if not exists preference_snapshot jsonb not null default '{}'::jsonb;

alter table notification_jobs
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists scheduled_for timestamptz,
  add column if not exists provider_name text,
  add column if not exists response_body jsonb not null default '{}'::jsonb,
  add column if not exists error_code text,
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists permanent_failure boolean not null default false;

alter table notification_templates
  add column if not exists whatsapp_template_name text,
  add column if not exists sample_data jsonb not null default '{}'::jsonb;

alter table notification_event_settings
  add column if not exists channel_pause_until timestamptz,
  add column if not exists quiet_hours_start time,
  add column if not exists quiet_hours_end time,
  add column if not exists sender_name text,
  add column if not exists throttle_per_hour integer not null default 0,
  add column if not exists retry_max_attempts integer not null default 3,
  add column if not exists manager_broadcast_scope text not null default 'ALL_ACTIVE_RESIDENTS',
  add column if not exists critical_bypass_quiet_hours boolean not null default true,
  add constraint notification_event_settings_throttle_chk check (throttle_per_hour >= 0),
  add constraint notification_event_settings_retry_chk check (retry_max_attempts > 0);

alter table push_subscriptions
  add column if not exists browser_name text,
  add column if not exists platform text,
  add column if not exists last_error text;

alter table user_notification_preferences
  add column if not exists channel_paused_until timestamptz,
  add column if not exists allow_critical_bypass boolean not null default true;

create table if not exists notice_reads (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references notices(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  read_at timestamptz not null default now(),
  dismissed_at timestamptz,
  unique (notice_id, user_id)
);

create index if not exists notification_jobs_claim_idx
  on notification_jobs (status, scheduled_for, next_attempt_at, priority, created_at);
create index if not exists notification_jobs_locked_at_idx on notification_jobs (locked_at);
create index if not exists notification_events_source_idx on notification_events (source_table, source_id);
create index if not exists in_app_notifications_created_at_idx on in_app_notifications (created_at);
create index if not exists notice_reads_user_id_idx on notice_reads (user_id);
