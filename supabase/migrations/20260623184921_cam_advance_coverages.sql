create table if not exists cam_advance_coverages (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  flat_id uuid not null references flats(id) on delete restrict,
  covered_from date not null,
  covered_until date not null,
  amount numeric(10,2),
  source text not null default 'MANUAL',
  reference text,
  notes text,
  is_active boolean not null default true,
  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (covered_until >= covered_from),
  check (amount is null or amount >= 0),
  check (source in ('MANUAL', 'PAYMENT', 'IMPORT', 'OPENING_BALANCE', 'LEGACY_MARKER'))
);

create index if not exists cam_advance_coverages_society_flat_dates_idx
  on cam_advance_coverages (society_id, flat_id, covered_from, covered_until)
  where is_active = true;

create index if not exists cam_advance_coverages_society_until_idx
  on cam_advance_coverages (society_id, covered_until)
  where is_active = true;

drop trigger if exists cam_advance_coverages_set_updated_at on cam_advance_coverages;
create trigger cam_advance_coverages_set_updated_at
  before update on cam_advance_coverages
  for each row execute function set_updated_at();

insert into cam_advance_coverages (
  society_id,
  flat_id,
  covered_from,
  covered_until,
  source,
  notes,
  created_at,
  updated_at
)
select
  f.society_id,
  f.id,
  date '1900-01-01',
  f.cam_advance_paid_until,
  'LEGACY_MARKER',
  coalesce(nullif(f.cam_advance_note, ''), 'Backfilled from flat CAM paid-until marker.'),
  coalesce(f.cam_advance_updated_at, now()),
  coalesce(f.cam_advance_updated_at, now())
from flats f
where f.cam_advance_paid_until is not null
  and not exists (
    select 1
    from cam_advance_coverages existing
    where existing.society_id = f.society_id
      and existing.flat_id = f.id
      and existing.covered_from = date '1900-01-01'
      and existing.covered_until = f.cam_advance_paid_until
      and existing.source = 'LEGACY_MARKER'
      and existing.is_active = true
  );

create or replace function sync_flat_cam_advance_from_coverages()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_society_id uuid;
  target_flat_id uuid;
  next_paid_until date;
  next_note text;
  actor_user_id uuid;
begin
  if tg_op = 'UPDATE' then
    if old.society_id is distinct from new.society_id or old.flat_id is distinct from new.flat_id then
      select coverage.covered_until, coverage.notes
        into next_paid_until, next_note
      from cam_advance_coverages coverage
      where coverage.society_id = old.society_id
        and coverage.flat_id = old.flat_id
        and coverage.is_active = true
      order by coverage.covered_until desc, coverage.updated_at desc, coverage.created_at desc
      limit 1;

      update flats
      set
        cam_advance_paid_until = next_paid_until,
        cam_advance_note = next_note,
        cam_advance_updated_at = now(),
        cam_advance_updated_by_user_id = coalesce(new.updated_by_user_id, old.updated_by_user_id, cam_advance_updated_by_user_id),
        updated_at = now()
      where society_id = old.society_id
        and id = old.flat_id;
    end if;
  end if;

  if tg_op = 'DELETE' then
    target_society_id := old.society_id;
    target_flat_id := old.flat_id;
    actor_user_id := coalesce(old.updated_by_user_id, old.created_by_user_id);
  elsif tg_op = 'INSERT' then
    target_society_id := new.society_id;
    target_flat_id := new.flat_id;
    actor_user_id := coalesce(new.updated_by_user_id, new.created_by_user_id);
  else
    target_society_id := new.society_id;
    target_flat_id := new.flat_id;
    actor_user_id := coalesce(
      new.updated_by_user_id,
      new.created_by_user_id,
      old.updated_by_user_id,
      old.created_by_user_id
    );
  end if;

  select coverage.covered_until, coverage.notes
    into next_paid_until, next_note
  from cam_advance_coverages coverage
  where coverage.society_id = target_society_id
    and coverage.flat_id = target_flat_id
    and coverage.is_active = true
  order by coverage.covered_until desc, coverage.updated_at desc, coverage.created_at desc
  limit 1;

  update flats
  set
    cam_advance_paid_until = next_paid_until,
    cam_advance_note = next_note,
    cam_advance_updated_at = now(),
    cam_advance_updated_by_user_id = coalesce(actor_user_id, cam_advance_updated_by_user_id),
    updated_at = now()
  where society_id = target_society_id
    and id = target_flat_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists cam_advance_coverages_sync_flat on cam_advance_coverages;
create trigger cam_advance_coverages_sync_flat
  after insert or update or delete on cam_advance_coverages
  for each row execute function sync_flat_cam_advance_from_coverages();
