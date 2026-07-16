create table if not exists public.cam_payment_arrangements (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  flat_id uuid not null references public.flats(id) on delete restrict,
  penalty_free_until_day smallint not null default 26,
  effective_from date not null,
  effective_until date,
  reason text not null,
  reference text,
  approved_by_user_id uuid references public.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  revoked_by_user_id uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (penalty_free_until_day between 1 and 31),
  check (effective_until is null or effective_until >= effective_from),
  check (revoked_at is null or is_active = false)
);

create index if not exists cam_payment_arrangements_society_flat_idx
  on public.cam_payment_arrangements (society_id, flat_id);

create index if not exists cam_payment_arrangements_active_effective_idx
  on public.cam_payment_arrangements (society_id, flat_id, effective_from, effective_until)
  where is_active = true and revoked_at is null;

create unique index if not exists cam_payment_arrangements_open_active_flat_key
  on public.cam_payment_arrangements (society_id, flat_id)
  where is_active = true and revoked_at is null and effective_until is null;

drop trigger if exists cam_payment_arrangements_set_updated_at on public.cam_payment_arrangements;
create trigger cam_payment_arrangements_set_updated_at
  before update on public.cam_payment_arrangements
  for each row execute function set_updated_at();

alter table public.cam_payment_arrangements enable row level security;
revoke all on table public.cam_payment_arrangements from anon, authenticated;
grant select, insert, update, delete on table public.cam_payment_arrangements to service_role;

alter table public.maintenance_dues
  add column if not exists cam_payment_arrangement_id uuid references public.cam_payment_arrangements(id) on delete set null,
  add column if not exists late_fee_starts_on date;

create index if not exists maintenance_dues_cam_payment_arrangement_id_idx
  on public.maintenance_dues (cam_payment_arrangement_id)
  where cam_payment_arrangement_id is not null;

create index if not exists maintenance_dues_late_fee_starts_on_idx
  on public.maintenance_dues (late_fee_starts_on)
  where late_fee_starts_on is not null;
