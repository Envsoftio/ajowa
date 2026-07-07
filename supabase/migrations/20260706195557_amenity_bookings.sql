create extension if not exists btree_gist;

alter type notification_event_category add value if not exists 'AMENITY_BOOKINGS';
alter type document_sequence_type add value if not exists 'AMENITY_BOOKING';

do $$
begin
  create type amenity_booking_status as enum (
    'REQUESTED',
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'COMPLETED',
    'NO_SHOW'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type amenity_booking_event_type as enum (
    'CREATED',
    'UPDATED',
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'COMPLETED',
    'NO_SHOW',
    'INTERNAL_NOTE'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.amenities (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  location text,
  capacity integer,
  is_active boolean not null default true,
  is_bookable boolean not null default true,
  requires_approval boolean not null default true,
  operating_hours jsonb not null default '{}'::jsonb,
  booking_rules jsonb not null default '{}'::jsonb,
  rules_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (capacity is null or capacity > 0),
  unique (society_id, code),
  unique (society_id, name)
);

create table if not exists public.amenity_bookings (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  booking_number text not null unique,
  amenity_id uuid not null references public.amenities(id) on delete restrict,
  requester_user_id uuid not null references public.users(id) on delete restrict,
  flat_id uuid not null references public.flats(id) on delete restrict,
  status amenity_booking_status not null default 'REQUESTED',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  guest_count integer,
  purpose text not null,
  resident_notes text,
  admin_notes text,
  decision_reason text,
  approved_by_user_id uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by_user_id uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  cancelled_by_user_id uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  completed_by_user_id uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (guest_count is null or guest_count > 0)
);

create table if not exists public.amenity_booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.amenity_bookings(id) on delete cascade,
  event_type amenity_booking_event_type not null,
  actor_user_id uuid references public.users(id) on delete set null,
  from_status amenity_booking_status,
  to_status amenity_booking_status,
  visibility text not null default 'RESIDENT_VISIBLE',
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (visibility in ('RESIDENT_VISIBLE', 'INTERNAL_NOTE', 'SYSTEM'))
);

create table if not exists public.amenity_blackouts (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  amenity_id uuid not null references public.amenities(id) on delete restrict,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create or replace function public.assert_amenity_booking_integrity()
returns trigger
language plpgsql
as $$
declare
  v_amenity_society_id uuid;
  v_flat_society_id uuid;
  v_requester_society_id uuid;
  v_actor_society_id uuid;
  v_blackout_title text;
begin
  select society_id into v_amenity_society_id
  from public.amenities
  where id = new.amenity_id;

  if v_amenity_society_id is null or v_amenity_society_id <> new.society_id then
    raise exception 'amenity must belong to booking society';
  end if;

  select society_id into v_flat_society_id
  from public.flats
  where id = new.flat_id;

  if v_flat_society_id is null or v_flat_society_id <> new.society_id then
    raise exception 'flat must belong to booking society';
  end if;

  select society_id into v_requester_society_id
  from public.users
  where id = new.requester_user_id;

  if v_requester_society_id is null or v_requester_society_id <> new.society_id then
    raise exception 'requester must belong to booking society';
  end if;

  foreach v_actor_society_id in array array[
    new.approved_by_user_id,
    new.rejected_by_user_id,
    new.cancelled_by_user_id,
    new.completed_by_user_id
  ]
  loop
    if v_actor_society_id is not null then
      if not exists (
        select 1
        from public.users actor
        where actor.id = v_actor_society_id
          and actor.society_id = new.society_id
      ) then
        raise exception 'booking actor must belong to booking society';
      end if;
    end if;
  end loop;

  if new.status = 'APPROVED' then
    select blackout.title into v_blackout_title
    from public.amenity_blackouts blackout
    where blackout.amenity_id = new.amenity_id
      and tstzrange(blackout.starts_at, blackout.ends_at, '[)')
        && tstzrange(new.starts_at, new.ends_at, '[)')
    limit 1;

    if v_blackout_title is not null then
      raise exception 'approved booking overlaps blackout: %', v_blackout_title;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.assert_amenity_blackout_integrity()
returns trigger
language plpgsql
as $$
declare
  v_amenity_society_id uuid;
  v_creator_society_id uuid;
  v_booking_number text;
begin
  select society_id into v_amenity_society_id
  from public.amenities
  where id = new.amenity_id;

  if v_amenity_society_id is null or v_amenity_society_id <> new.society_id then
    raise exception 'amenity must belong to blackout society';
  end if;

  if new.created_by_user_id is not null then
    select society_id into v_creator_society_id
    from public.users
    where id = new.created_by_user_id;

    if v_creator_society_id is null or v_creator_society_id <> new.society_id then
      raise exception 'blackout creator must belong to blackout society';
    end if;
  end if;

  select booking.booking_number into v_booking_number
  from public.amenity_bookings booking
  where booking.amenity_id = new.amenity_id
    and booking.status = 'APPROVED'
    and tstzrange(booking.starts_at, booking.ends_at, '[)')
      && tstzrange(new.starts_at, new.ends_at, '[)')
  limit 1;

  if v_booking_number is not null then
    raise exception 'blackout overlaps approved booking: %', v_booking_number;
  end if;

  return new;
end;
$$;

drop trigger if exists amenities_set_updated_at on public.amenities;
create trigger amenities_set_updated_at
  before update on public.amenities
  for each row execute function public.set_updated_at();

drop trigger if exists amenity_bookings_set_updated_at on public.amenity_bookings;
create trigger amenity_bookings_set_updated_at
  before update on public.amenity_bookings
  for each row execute function public.set_updated_at();

drop trigger if exists amenity_bookings_validate on public.amenity_bookings;
create trigger amenity_bookings_validate
  before insert or update on public.amenity_bookings
  for each row execute function public.assert_amenity_booking_integrity();

drop trigger if exists amenity_blackouts_set_updated_at on public.amenity_blackouts;
create trigger amenity_blackouts_set_updated_at
  before update on public.amenity_blackouts
  for each row execute function public.set_updated_at();

drop trigger if exists amenity_blackouts_validate on public.amenity_blackouts;
create trigger amenity_blackouts_validate
  before insert or update on public.amenity_blackouts
  for each row execute function public.assert_amenity_blackout_integrity();

alter table public.amenity_bookings
  drop constraint if exists amenity_bookings_no_approved_overlap;

alter table public.amenity_bookings
  add constraint amenity_bookings_no_approved_overlap
  exclude using gist (
    amenity_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status = 'APPROVED');

create index if not exists amenities_society_active_idx
  on public.amenities (society_id, is_active, is_bookable, name);

create index if not exists amenity_bookings_society_starts_idx
  on public.amenity_bookings (society_id, starts_at desc);

create index if not exists amenity_bookings_society_status_starts_idx
  on public.amenity_bookings (society_id, status, starts_at desc);

create index if not exists amenity_bookings_amenity_window_idx
  on public.amenity_bookings (amenity_id, starts_at, ends_at);

create index if not exists amenity_bookings_flat_starts_idx
  on public.amenity_bookings (flat_id, starts_at desc);

create index if not exists amenity_bookings_requester_starts_idx
  on public.amenity_bookings (requester_user_id, starts_at desc);

create index if not exists amenity_booking_events_booking_created_idx
  on public.amenity_booking_events (booking_id, created_at asc);

create index if not exists amenity_booking_events_actor_created_idx
  on public.amenity_booking_events (actor_user_id, created_at desc);

create index if not exists amenity_blackouts_society_starts_idx
  on public.amenity_blackouts (society_id, starts_at desc);

create index if not exists amenity_blackouts_amenity_window_idx
  on public.amenity_blackouts (amenity_id, starts_at, ends_at);

alter table public.amenities enable row level security;
alter table public.amenity_bookings enable row level security;
alter table public.amenity_booking_events enable row level security;
alter table public.amenity_blackouts enable row level security;

grant select, insert, update, delete on table public.amenities to service_role;
grant select, insert, update, delete on table public.amenity_bookings to service_role;
grant select, insert, update, delete on table public.amenity_booking_events to service_role;
grant select, insert, update, delete on table public.amenity_blackouts to service_role;

insert into public.amenities (
  society_id,
  code,
  name,
  description,
  location,
  capacity,
  is_active,
  is_bookable,
  requires_approval,
  operating_hours,
  booking_rules,
  rules_text
)
select
  sp.id,
  seed.code,
  seed.name,
  seed.description,
  seed.location,
  seed.capacity,
  true,
  true,
  true,
  seed.operating_hours,
  seed.booking_rules,
  seed.rules_text
from public.society_profile sp
cross join (
  values
    (
      'CLUBHOUSE',
      'Clubhouse',
      'Shared clubhouse for resident events and society-approved gatherings.',
      'Clubhouse',
      50,
      '{
        "monday": [{"start": "09:00", "end": "22:00"}],
        "tuesday": [{"start": "09:00", "end": "22:00"}],
        "wednesday": [{"start": "09:00", "end": "22:00"}],
        "thursday": [{"start": "09:00", "end": "22:00"}],
        "friday": [{"start": "09:00", "end": "22:00"}],
        "saturday": [{"start": "09:00", "end": "23:00"}],
        "sunday": [{"start": "09:00", "end": "23:00"}]
      }'::jsonb,
      '{
        "minDurationMinutes": 60,
        "maxDurationMinutes": 240,
        "slotIntervalMinutes": 30,
        "minimumLeadHours": 24,
        "maximumAdvanceDays": 60,
        "cancellationCutoffHours": 24
      }'::jsonb,
      'Bookings require society approval. Residents must follow amenity timing, guest, cleanliness, and noise rules.'
    ),
    (
      'COMMUNITY_HALL',
      'Community Hall',
      'Community hall for resident meetings, cultural events, and approved private functions.',
      'Community Hall',
      100,
      '{
        "monday": [{"start": "09:00", "end": "22:00"}],
        "tuesday": [{"start": "09:00", "end": "22:00"}],
        "wednesday": [{"start": "09:00", "end": "22:00"}],
        "thursday": [{"start": "09:00", "end": "22:00"}],
        "friday": [{"start": "09:00", "end": "22:00"}],
        "saturday": [{"start": "09:00", "end": "23:00"}],
        "sunday": [{"start": "09:00", "end": "23:00"}]
      }'::jsonb,
      '{
        "minDurationMinutes": 60,
        "maxDurationMinutes": 240,
        "slotIntervalMinutes": 30,
        "minimumLeadHours": 24,
        "maximumAdvanceDays": 60,
        "cancellationCutoffHours": 24
      }'::jsonb,
      'Bookings require society approval. Residents must follow amenity timing, guest, cleanliness, and noise rules.'
    )
) as seed(code, name, description, location, capacity, operating_hours, booking_rules, rules_text)
on conflict (society_id, code) do update
  set name = excluded.name,
      description = excluded.description,
      location = excluded.location,
      capacity = excluded.capacity,
      is_active = excluded.is_active,
      is_bookable = excluded.is_bookable,
      requires_approval = excluded.requires_approval,
      operating_hours = excluded.operating_hours,
      booking_rules = excluded.booking_rules,
      rules_text = excluded.rules_text,
      updated_at = now();

update public.users
set staff_permissions = (
      select array_agg(distinct permission order by permission)
      from unnest(staff_permissions || array['amenity-bookings.manage', 'amenities.manage']) as permission
    ),
    updated_at = now()
where role = 'MANAGER'
  and deleted_at is null
  and cardinality(staff_permissions) > 0;
