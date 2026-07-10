create table if not exists whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  object_type text,
  entry_id text,
  field_name text,
  event_type text not null,
  provider_message_id text,
  phone_number_id text,
  display_phone_number text,
  wa_id text,
  status text,
  event_timestamp timestamptz,
  signature text,
  raw_payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_error text,
  received_count integer not null default 1,
  last_received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (received_count > 0)
);

create index if not exists whatsapp_webhook_events_provider_message_idx
  on whatsapp_webhook_events (provider_message_id)
  where provider_message_id is not null;

create index if not exists whatsapp_webhook_events_created_at_idx
  on whatsapp_webhook_events (created_at desc);

create index if not exists whatsapp_webhook_events_event_type_idx
  on whatsapp_webhook_events (event_type, status);

drop trigger if exists whatsapp_webhook_events_set_updated_at on whatsapp_webhook_events;
create trigger whatsapp_webhook_events_set_updated_at
  before update on whatsapp_webhook_events
  for each row execute function set_updated_at();

alter table whatsapp_webhook_events enable row level security;

revoke all on table whatsapp_webhook_events from anon, authenticated;
