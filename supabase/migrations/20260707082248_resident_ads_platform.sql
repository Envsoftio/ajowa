do $$
begin
  if not exists (select 1 from pg_type where typname = 'ad_campaign_status') then
    create type ad_campaign_status as enum ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
  end if;

  if not exists (select 1 from pg_type where typname = 'ad_event_type') then
    create type ad_event_type as enum ('IMPRESSION', 'CLICK', 'DISMISS');
  end if;
end $$;

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  name text not null,
  description text,
  status ad_campaign_status not null default 'DRAFT',
  starts_at timestamptz,
  ends_at timestamptz,
  priority integer not null default 0,
  targeting jsonb not null default '{"scope":"ALL_ACTIVE_RESIDENTS"}'::jsonb,
  frequency_cap jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_campaigns_name_not_blank_chk check (btrim(name) <> ''),
  constraint ad_campaigns_schedule_chk check (ends_at is null or starts_at is null or ends_at >= starts_at),
  constraint ad_campaigns_targeting_object_chk check (jsonb_typeof(targeting) = 'object'),
  constraint ad_campaigns_frequency_cap_object_chk check (jsonb_typeof(frequency_cap) = 'object')
);

create unique index if not exists ad_campaigns_id_society_id_idx
  on public.ad_campaigns (id, society_id);

create table if not exists public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  society_id uuid not null references public.society_profile(id) on delete restrict,
  slot_key text not null,
  title text not null,
  body text,
  cta_label text,
  image_url text not null,
  destination_url text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  allow_dismiss boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_creatives_slot_key_not_blank_chk check (btrim(slot_key) <> ''),
  constraint ad_creatives_title_not_blank_chk check (btrim(title) <> ''),
  constraint ad_creatives_metadata_object_chk check (jsonb_typeof(metadata) = 'object'),
  constraint ad_creatives_image_url_web_chk check (
    image_url ~* '^https://'
    or image_url ~* '^http://(localhost|127\.0\.0\.1)(:[0-9]+)?(/|$)'
  ),
  constraint ad_creatives_destination_url_web_chk check (
    destination_url ~* '^https://'
    or destination_url ~* '^http://(localhost|127\.0\.0\.1)(:[0-9]+)?(/|$)'
  ),
  constraint ad_creatives_campaign_society_fk
    foreign key (campaign_id, society_id)
    references public.ad_campaigns(id, society_id)
    on delete cascade
);

create unique index if not exists ad_creatives_id_society_id_idx
  on public.ad_creatives (id, society_id);
create unique index if not exists ad_creatives_id_campaign_id_society_id_idx
  on public.ad_creatives (id, campaign_id, society_id);

create table if not exists public.ad_events (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  campaign_id uuid not null,
  creative_id uuid not null,
  user_id uuid references public.users(id) on delete restrict,
  flat_id uuid references public.flats(id) on delete restrict,
  event_type ad_event_type not null,
  slot_key text not null,
  page_path text,
  occurred_at timestamptz not null default now(),
  request_id text,
  session_key text,
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  constraint ad_events_slot_key_not_blank_chk check (btrim(slot_key) <> ''),
  constraint ad_events_metadata_object_chk check (jsonb_typeof(metadata) = 'object'),
  constraint ad_events_campaign_society_fk
    foreign key (campaign_id, society_id)
    references public.ad_campaigns(id, society_id)
    on delete restrict,
  constraint ad_events_creative_campaign_society_fk
    foreign key (creative_id, campaign_id, society_id)
    references public.ad_creatives(id, campaign_id, society_id)
    on delete restrict
);

create table if not exists public.ad_api_keys (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  name text not null,
  key_hash text not null unique,
  scopes text[] not null default array['ads.manage']::text[],
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ad_api_keys_name_not_blank_chk check (btrim(name) <> ''),
  constraint ad_api_keys_hash_not_blank_chk check (btrim(key_hash) <> ''),
  constraint ad_api_keys_scopes_not_empty_chk check (array_length(scopes, 1) > 0)
);

create index if not exists ad_campaigns_society_status_schedule_idx
  on public.ad_campaigns (society_id, status, priority desc, created_at desc);
create index if not exists ad_campaigns_society_created_at_idx
  on public.ad_campaigns (society_id, created_at desc);
create index if not exists ad_creatives_campaign_id_idx
  on public.ad_creatives (campaign_id);
create index if not exists ad_creatives_society_slot_active_idx
  on public.ad_creatives (society_id, slot_key, is_active, display_order);
create index if not exists ad_events_society_occurred_at_idx
  on public.ad_events (society_id, occurred_at desc);
create index if not exists ad_events_campaign_occurred_at_idx
  on public.ad_events (campaign_id, occurred_at desc);
create index if not exists ad_events_creative_type_occurred_at_idx
  on public.ad_events (creative_id, event_type, occurred_at desc);
create index if not exists ad_events_user_type_occurred_at_idx
  on public.ad_events (user_id, event_type, occurred_at desc);
create index if not exists ad_events_flat_type_occurred_at_idx
  on public.ad_events (flat_id, event_type, occurred_at desc);
create index if not exists ad_api_keys_society_id_idx
  on public.ad_api_keys (society_id);

drop trigger if exists ad_campaigns_set_updated_at on public.ad_campaigns;
create trigger ad_campaigns_set_updated_at
  before update on public.ad_campaigns
  for each row execute function public.set_updated_at();

drop trigger if exists ad_creatives_set_updated_at on public.ad_creatives;
create trigger ad_creatives_set_updated_at
  before update on public.ad_creatives
  for each row execute function public.set_updated_at();

create or replace function public.prevent_ad_events_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ad_events is append-only';
end;
$$;

drop trigger if exists ad_events_prevent_update on public.ad_events;
create trigger ad_events_prevent_update
  before update on public.ad_events
  for each row execute function public.prevent_ad_events_mutation();

drop trigger if exists ad_events_prevent_delete on public.ad_events;
create trigger ad_events_prevent_delete
  before delete on public.ad_events
  for each row execute function public.prevent_ad_events_mutation();

alter table public.ad_campaigns enable row level security;
alter table public.ad_creatives enable row level security;
alter table public.ad_events enable row level security;
alter table public.ad_api_keys enable row level security;

revoke all on table public.ad_campaigns from anon, authenticated;
revoke all on table public.ad_creatives from anon, authenticated;
revoke all on table public.ad_events from anon, authenticated;
revoke all on table public.ad_api_keys from anon, authenticated;
