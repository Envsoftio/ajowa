update storage.buckets
set
  file_size_limit = 104857600,
  allowed_mime_types = case
    when allowed_mime_types is null then array['application/zip']::text[]
    when not ('application/zip' = any(allowed_mime_types)) then allowed_mime_types || array['application/zip']::text[]
    else allowed_mime_types
  end
where id = 'report-exports';

alter table public.file_objects
  drop constraint if exists file_objects_size_bytes_check;

alter table public.file_objects
  add constraint file_objects_size_bytes_check
  check (
    size_bytes > 0
    and (
      (storage_target_key = 'report_exports' and size_bytes <= 104857600)
      or (storage_target_key <> 'report_exports' and size_bytes <= 10485760)
    )
  );

create table if not exists public.billing_bill_export_jobs (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  requested_by_user_id uuid not null references public.users(id) on delete restrict,
  status text not null default 'QUEUED' check (status in ('QUEUED', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED')),
  request_payload jsonb not null default '{}'::jsonb,
  total_count integer not null default 0 check (total_count >= 0),
  processed_count integer not null default 0 check (processed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  failed_items jsonb not null default '[]'::jsonb,
  storage_file_id uuid references public.file_objects(id) on delete set null,
  storage_object_key text,
  file_name text,
  file_size_bytes bigint,
  error_message text,
  locked_by text,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (timezone('utc', now()) + interval '24 hours'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists billing_bill_export_jobs_society_requested_idx
  on public.billing_bill_export_jobs (society_id, requested_by_user_id, created_at desc);

create index if not exists billing_bill_export_jobs_status_idx
  on public.billing_bill_export_jobs (status, created_at);

create index if not exists billing_bill_export_jobs_expires_idx
  on public.billing_bill_export_jobs (expires_at);

create index if not exists billing_bill_export_jobs_storage_file_idx
  on public.billing_bill_export_jobs (storage_file_id);

drop trigger if exists billing_bill_export_jobs_set_updated_at on public.billing_bill_export_jobs;

create trigger billing_bill_export_jobs_set_updated_at
  before update on public.billing_bill_export_jobs
  for each row execute function public.set_updated_at();

alter table public.billing_bill_export_jobs enable row level security;

grant select, insert, update, delete on table public.billing_bill_export_jobs to service_role;
