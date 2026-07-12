create table if not exists public.professions (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_public_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(name) <> ''),
  check (sort_order >= 0)
);

create unique index if not exists professions_society_name_key
  on public.professions (society_id, lower(btrim(name)));

create index if not exists professions_society_active_idx
  on public.professions (society_id, is_active, sort_order, name);

create index if not exists professions_society_public_idx
  on public.professions (society_id, sort_order, name)
  where is_active = true and is_public_allowed = true;

drop trigger if exists professions_set_updated_at on public.professions;
create trigger professions_set_updated_at
  before update on public.professions
  for each row execute function public.set_updated_at();

create table if not exists public.resident_profession_profiles (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  profession_id uuid not null references public.professions(id) on delete restrict,
  is_active boolean not null default true,
  is_public boolean not null default false,
  admin_note text,
  profession_consent_source text,
  profession_consent_proof_file_path text,
  profession_consent_note text,
  profession_consent_recorded_at timestamptz,
  profession_consent_recorded_by_user_id uuid references public.users(id) on delete set null,
  share_phone boolean not null default false,
  phone_source text,
  public_phone text,
  share_email boolean not null default false,
  email_source text,
  public_email extensions.citext,
  contact_consent_source text,
  contact_consent_proof_file_path text,
  contact_consent_note text,
  contact_consent_recorded_at timestamptz,
  contact_consent_recorded_by_user_id uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.users(id) on delete set null,
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  check (admin_note is null or char_length(admin_note) <= 1000),
  check (profession_consent_note is null or char_length(profession_consent_note) <= 1000),
  check (contact_consent_note is null or char_length(contact_consent_note) <= 1000),
  check (revocation_reason is null or char_length(revocation_reason) <= 700),
  check (
    profession_consent_source is null
    or profession_consent_source in ('LETTER', 'EMAIL', 'FORM', 'VERBAL', 'OTHER')
  ),
  check (
    contact_consent_source is null
    or contact_consent_source in ('LETTER', 'EMAIL', 'FORM', 'VERBAL', 'OTHER')
  ),
  check (phone_source is null or phone_source in ('REGISTERED_MOBILE', 'CUSTOM')),
  check (email_source is null or email_source in ('REGISTERED_EMAIL', 'CUSTOM')),
  check (
    is_public = false
    or (
      is_active = true
      and profession_consent_source is not null
      and profession_consent_recorded_at is not null
      and profession_consent_recorded_by_user_id is not null
    )
  ),
  check (
    share_phone = false
    or (
      is_public = true
      and phone_source is not null
      and public_phone is not null
      and btrim(public_phone) <> ''
      and contact_consent_source is not null
      and contact_consent_recorded_at is not null
      and contact_consent_recorded_by_user_id is not null
    )
  ),
  check (
    share_email = false
    or (
      is_public = true
      and email_source is not null
      and public_email is not null
      and btrim(public_email::text) <> ''
      and contact_consent_source is not null
      and contact_consent_recorded_at is not null
      and contact_consent_recorded_by_user_id is not null
    )
  ),
  check (
    is_active = true
    or (is_public = false and share_phone = false and share_email = false)
  )
);

create or replace function public.ensure_valid_resident_profession_profile()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_society_id uuid;
  v_user_role public.app_role;
  v_profession_society_id uuid;
begin
  select society_id, role
  into v_user_society_id, v_user_role
  from public.users
  where id = new.user_id;

  if v_user_society_id is null then
    raise exception 'resident profession profile requires a valid user';
  end if;

  if v_user_role <> 'RESIDENT' then
    raise exception 'profession profiles can only be assigned to residents';
  end if;

  select society_id
  into v_profession_society_id
  from public.professions
  where id = new.profession_id;

  if v_profession_society_id is null then
    raise exception 'resident profession profile requires a valid profession';
  end if;

  if new.society_id <> v_user_society_id or new.society_id <> v_profession_society_id then
    raise exception 'resident profession profile society mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists resident_profession_profiles_validate on public.resident_profession_profiles;
create trigger resident_profession_profiles_validate
  before insert or update on public.resident_profession_profiles
  for each row execute function public.ensure_valid_resident_profession_profile();

drop trigger if exists resident_profession_profiles_set_updated_at on public.resident_profession_profiles;
create trigger resident_profession_profiles_set_updated_at
  before update on public.resident_profession_profiles
  for each row execute function public.set_updated_at();

create index if not exists resident_profession_profiles_society_idx
  on public.resident_profession_profiles (society_id);

create index if not exists resident_profession_profiles_profession_idx
  on public.resident_profession_profiles (profession_id);

create index if not exists resident_profession_profiles_public_idx
  on public.resident_profession_profiles (society_id, profession_id, updated_at desc)
  where is_active = true and is_public = true and revoked_at is null;

create index if not exists resident_profession_profiles_public_phone_idx
  on public.resident_profession_profiles (society_id)
  where is_active = true and is_public = true and share_phone = true and revoked_at is null;

create index if not exists resident_profession_profiles_public_email_idx
  on public.resident_profession_profiles (society_id)
  where is_active = true and is_public = true and share_email = true and revoked_at is null;

alter table public.professions enable row level security;
alter table public.resident_profession_profiles enable row level security;
