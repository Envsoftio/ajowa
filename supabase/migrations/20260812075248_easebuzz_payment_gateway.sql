alter table public.payments
  add column if not exists payment_provider text,
  add column if not exists gateway_paid_at timestamptz,
  add column if not exists gateway_finalized_at timestamptz,
  add column if not exists gateway_finalization_error text;

alter table public.payments
  drop constraint if exists payments_payment_provider_check;

alter table public.payments
  add constraint payments_payment_provider_check
  check (
    (mode = 'ONLINE_GATEWAY' and payment_provider = 'EASEBUZZ')
    or (mode <> 'ONLINE_GATEWAY' and payment_provider is null)
  ) not valid;

do $$
begin
  if exists (
    select 1
    from public.payments
    where mode = 'ONLINE_GATEWAY'
      and (
        payment_provider is distinct from 'EASEBUZZ'
        or gateway_order_id is not null
        or gateway_payment_id is not null
        or gateway_webhook_event_id is not null
        or receipt_number is not null
        or exists (
          select 1
          from public.payment_allocations allocation
          where allocation.payment_id = payments.id
        )
        or exists (
          select 1
          from public.journal_entries journal
          where journal.payment_id = payments.id
        )
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Unexpected existing online-gateway payment data found. Stop Easebuzz migration and investigate before replacing provider indexes.';
  end if;
end $$;

drop index if exists public.payments_gateway_order_idx;
drop index if exists public.payments_gateway_payment_idx;

create unique index payments_provider_gateway_order_uidx
  on public.payments (payment_provider, gateway_order_id)
  where payment_provider is not null and gateway_order_id is not null;

create unique index payments_provider_gateway_payment_uidx
  on public.payments (payment_provider, gateway_payment_id)
  where payment_provider is not null and gateway_payment_id is not null;

create index payments_online_reconciliation_idx
  on public.payments (payment_provider, status, created_at)
  where mode = 'ONLINE_GATEWAY'
    and status in ('INITIATED', 'PENDING_VERIFICATION');

create table public.payment_gateway_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  society_id uuid not null references public.society_profile(id) on delete restrict,
  provider text not null,
  merchant_transaction_id text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  status text not null default 'CREATED',
  amount numeric(10,2) not null,
  currency text not null default 'INR',
  initiation_response jsonb not null default '{}'::jsonb,
  access_key_ciphertext text,
  access_key_expires_at timestamptz,
  last_gateway_status text,
  authoritative_gateway_success_at timestamptz,
  gateway_payment_id text,
  bank_reference text,
  attempt_count integer not null default 0,
  failure_stage text,
  failure_code text,
  resident_message text,
  retry_allowed boolean not null default false,
  next_reconciliation_at timestamptz,
  manual_review_required_at timestamptz,
  last_error_code text,
  last_error_message text,
  initiated_at timestamptz,
  last_verified_at timestamptz,
  completed_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_gateway_attempts_provider_check check (provider = 'EASEBUZZ'),
  constraint payment_gateway_attempts_status_check check (
    status in (
      'CREATED',
      'INITIATING',
      'INITIATED',
      'PENDING_VERIFICATION',
      'GATEWAY_SUCCESS',
      'VERIFIED',
      'FAILED',
      'CANCELLED',
      'MANUAL_REVIEW'
    )
  ),
  constraint payment_gateway_attempts_amount_check check (amount > 0),
  constraint payment_gateway_attempts_currency_check check (currency = 'INR'),
  constraint payment_gateway_attempts_count_check check (attempt_count >= 0),
  constraint payment_gateway_attempts_txnid_check check (
    merchant_transaction_id ~ '^[A-Za-z0-9_|/-]{1,40}$'
  ),
  constraint payment_gateway_attempts_fingerprint_check check (
    request_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  unique (provider, merchant_transaction_id),
  unique (society_id, provider, idempotency_key),
  unique (payment_id, provider)
);

create index payment_gateway_attempts_payment_created_idx
  on public.payment_gateway_attempts (payment_id, created_at desc);

create index payment_gateway_attempts_society_id_idx
  on public.payment_gateway_attempts (society_id);

create index payment_gateway_attempts_reconciliation_idx
  on public.payment_gateway_attempts (
    provider,
    coalesce(next_reconciliation_at, updated_at),
    created_at
  )
  where status in (
    'CREATED',
    'INITIATING',
    'INITIATED',
    'PENDING_VERIFICATION',
    'GATEWAY_SUCCESS'
  );

create table public.payment_gateway_events (
  id uuid primary key default gen_random_uuid(),
  society_id uuid references public.society_profile(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  attempt_id uuid references public.payment_gateway_attempts(id) on delete restrict,
  provider text not null,
  event_fingerprint text not null,
  event_kind text not null,
  merchant_transaction_id text,
  gateway_payment_id text,
  gateway_status text,
  amount numeric(10,2),
  payload_hash text not null,
  hash_verified boolean not null default false,
  redacted_payload jsonb not null default '{}'::jsonb,
  received_count integer not null default 1,
  received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  retry_count integer not null default 0,
  last_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_gateway_events_provider_check check (provider = 'EASEBUZZ'),
  constraint payment_gateway_events_kind_check check (
    event_kind in ('CALLBACK', 'WEBHOOK', 'TRANSACTION_RETRIEVAL')
  ),
  constraint payment_gateway_events_amount_check check (amount is null or amount > 0),
  constraint payment_gateway_events_received_count_check check (received_count > 0),
  constraint payment_gateway_events_retry_count_check check (retry_count >= 0),
  constraint payment_gateway_events_payload_hash_check check (
    payload_hash ~ '^[a-f0-9]{64}$'
  ),
  unique (provider, event_fingerprint)
);

create index payment_gateway_events_society_id_idx
  on public.payment_gateway_events (society_id)
  where society_id is not null;

create index payment_gateway_events_payment_id_idx
  on public.payment_gateway_events (payment_id)
  where payment_id is not null;

create index payment_gateway_events_attempt_id_idx
  on public.payment_gateway_events (attempt_id)
  where attempt_id is not null;

create index payment_gateway_events_transaction_idx
  on public.payment_gateway_events (
    provider,
    merchant_transaction_id,
    received_at desc
  );

create index payment_gateway_events_unprocessed_idx
  on public.payment_gateway_events (provider, received_at)
  where processed_at is null and hash_verified = true;

create table public.payment_effect_jobs (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  job_type text not null,
  status text not null default 'QUEUED',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  last_error_message text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_effect_jobs_type_check check (
    job_type in ('RECEIPT_PDF', 'RECEIPT_NOTIFICATION')
  ),
  constraint payment_effect_jobs_status_check check (
    status in ('QUEUED', 'PROCESSING', 'RETRYING', 'COMPLETED', 'FAILED')
  ),
  constraint payment_effect_jobs_attempt_count_check check (attempt_count >= 0),
  unique (payment_id, job_type)
);

create index payment_effect_jobs_society_id_idx
  on public.payment_effect_jobs (society_id);

create index payment_effect_jobs_claim_idx
  on public.payment_effect_jobs (
    status,
    coalesce(next_attempt_at, created_at),
    created_at
  )
  where status in ('QUEUED', 'RETRYING', 'PROCESSING');

create table public.payment_gateway_settlements (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  provider text not null,
  provider_settlement_id text not null,
  source_fingerprint text not null,
  settlement_date date not null,
  currency text not null default 'INR',
  gross_amount numeric(12,2) not null,
  fee_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  adjustment_amount numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null,
  bank_account_id uuid references public.society_bank_accounts(id) on delete restrict,
  bank_reference text,
  source_kind text not null default 'STATEMENT_IMPORT',
  source_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'IMPORTED',
  reconciled_at timestamptz,
  reconciled_by_user_id uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_gateway_settlements_provider_check check (provider = 'EASEBUZZ'),
  constraint payment_gateway_settlements_currency_check check (currency = 'INR'),
  constraint payment_gateway_settlements_amounts_check check (
    gross_amount >= 0
    and fee_amount >= 0
    and tax_amount >= 0
    and net_amount >= 0
    and round(gross_amount - fee_amount - tax_amount + adjustment_amount, 2) = net_amount
  ),
  constraint payment_gateway_settlements_source_check check (
    source_kind in ('STATEMENT_IMPORT', 'API')
  ),
  constraint payment_gateway_settlements_status_check check (
    status in ('IMPORTED', 'MATCHING', 'REVIEW_REQUIRED', 'RECONCILED')
  ),
  constraint payment_gateway_settlements_fingerprint_check check (
    source_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  unique (provider, provider_settlement_id),
  unique (provider, source_fingerprint)
);

create index payment_gateway_settlements_society_date_idx
  on public.payment_gateway_settlements (society_id, settlement_date desc);

create index payment_gateway_settlements_bank_account_id_idx
  on public.payment_gateway_settlements (bank_account_id)
  where bank_account_id is not null;

create index payment_gateway_settlements_status_idx
  on public.payment_gateway_settlements (provider, status, settlement_date);

create table public.payment_gateway_settlement_items (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.payment_gateway_settlements(id) on delete restrict,
  society_id uuid not null references public.society_profile(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  attempt_id uuid references public.payment_gateway_attempts(id) on delete restrict,
  provider text not null,
  source_fingerprint text not null,
  merchant_transaction_id text,
  gateway_payment_id text,
  item_kind text not null default 'PAYMENT',
  gross_amount numeric(12,2) not null,
  fee_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  adjustment_amount numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null,
  match_status text not null default 'UNMATCHED',
  match_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_gateway_settlement_items_provider_check check (provider = 'EASEBUZZ'),
  constraint payment_gateway_settlement_items_kind_check check (
    item_kind in ('PAYMENT', 'REFUND', 'CHARGEBACK', 'RESERVE', 'ADJUSTMENT')
  ),
  constraint payment_gateway_settlement_items_match_check check (
    match_status in ('UNMATCHED', 'MATCHED', 'REVIEW_REQUIRED')
  ),
  constraint payment_gateway_settlement_items_amounts_check check (
    gross_amount >= 0
    and fee_amount >= 0
    and tax_amount >= 0
    and net_amount >= 0
    and round(gross_amount - fee_amount - tax_amount + adjustment_amount, 2) = net_amount
  ),
  constraint payment_gateway_settlement_items_fingerprint_check check (
    source_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  unique (provider, source_fingerprint)
);

create index payment_gateway_settlement_items_settlement_idx
  on public.payment_gateway_settlement_items (settlement_id, created_at);

create index payment_gateway_settlement_items_society_id_idx
  on public.payment_gateway_settlement_items (society_id);

create index payment_gateway_settlement_items_payment_id_idx
  on public.payment_gateway_settlement_items (payment_id)
  where payment_id is not null;

create index payment_gateway_settlement_items_attempt_id_idx
  on public.payment_gateway_settlement_items (attempt_id)
  where attempt_id is not null;

create index payment_gateway_settlement_items_unmatched_idx
  on public.payment_gateway_settlement_items (provider, match_status, created_at)
  where match_status <> 'MATCHED';

alter table public.journal_entries
  add column if not exists posting_source text not null default 'USER',
  add column if not exists payment_gateway_settlement_id uuid unique
    references public.payment_gateway_settlements(id) on delete restrict;

alter table public.journal_entries
  drop constraint if exists journal_entries_posting_source_check;

alter table public.journal_entries
  add constraint journal_entries_posting_source_check
  check (posting_source in ('USER', 'PAYMENT_GATEWAY', 'GATEWAY_SETTLEMENT'));

create index if not exists journal_entries_gateway_settlement_idx
  on public.journal_entries (payment_gateway_settlement_id)
  where payment_gateway_settlement_id is not null;

insert into public.account_heads (
  society_id,
  parent_id,
  code,
  name,
  head_type,
  is_system,
  is_active,
  allows_manual_entries
)
select
  null,
  parent.id,
  'ASSET-PG-EASEBUZZ',
  'Easebuzz Clearing',
  'ASSET'::account_head_type,
  true,
  true,
  false
from public.account_heads parent
where parent.code = 'SYS-ASSET'
on conflict (code) do update
set
  society_id = null,
  parent_id = excluded.parent_id,
  name = excluded.name,
  head_type = excluded.head_type,
  is_system = true,
  is_active = true,
  allows_manual_entries = false;

insert into public.account_heads (
  society_id,
  parent_id,
  code,
  name,
  head_type,
  is_system,
  is_active,
  allows_manual_entries
)
select
  null,
  parent.id,
  'EXP-PG-FEE',
  'Payment Gateway Fees',
  'EXPENSE'::account_head_type,
  true,
  true,
  false
from public.account_heads parent
where parent.code = 'SYS-EXPENSE'
on conflict (code) do update
set
  society_id = null,
  parent_id = excluded.parent_id,
  name = excluded.name,
  head_type = excluded.head_type,
  is_system = true,
  is_active = true,
  allows_manual_entries = false;

drop trigger if exists payment_gateway_attempts_set_updated_at on public.payment_gateway_attempts;
create trigger payment_gateway_attempts_set_updated_at
  before update on public.payment_gateway_attempts
  for each row execute function public.set_updated_at();

drop trigger if exists payment_gateway_events_set_updated_at on public.payment_gateway_events;
create trigger payment_gateway_events_set_updated_at
  before update on public.payment_gateway_events
  for each row execute function public.set_updated_at();

drop trigger if exists payment_effect_jobs_set_updated_at on public.payment_effect_jobs;
create trigger payment_effect_jobs_set_updated_at
  before update on public.payment_effect_jobs
  for each row execute function public.set_updated_at();

drop trigger if exists payment_gateway_settlements_set_updated_at on public.payment_gateway_settlements;
create trigger payment_gateway_settlements_set_updated_at
  before update on public.payment_gateway_settlements
  for each row execute function public.set_updated_at();

drop trigger if exists payment_gateway_settlement_items_set_updated_at on public.payment_gateway_settlement_items;
create trigger payment_gateway_settlement_items_set_updated_at
  before update on public.payment_gateway_settlement_items
  for each row execute function public.set_updated_at();

alter table public.payment_gateway_attempts enable row level security;
alter table public.payment_gateway_events enable row level security;
alter table public.payment_effect_jobs enable row level security;
alter table public.payment_gateway_settlements enable row level security;
alter table public.payment_gateway_settlement_items enable row level security;

revoke all on table public.payment_gateway_attempts from anon, authenticated;
revoke all on table public.payment_gateway_events from anon, authenticated;
revoke all on table public.payment_effect_jobs from anon, authenticated;
revoke all on table public.payment_gateway_settlements from anon, authenticated;
revoke all on table public.payment_gateway_settlement_items from anon, authenticated;

revoke all on table public.payment_gateway_attempts from service_role;
revoke all on table public.payment_gateway_events from service_role;
revoke all on table public.payment_effect_jobs from service_role;
revoke all on table public.payment_gateway_settlements from service_role;
revoke all on table public.payment_gateway_settlement_items from service_role;

grant select, insert, update on table public.payment_gateway_attempts to service_role;
grant select, insert, update on table public.payment_gateway_events to service_role;
grant select, insert, update on table public.payment_effect_jobs to service_role;
grant select, insert, update on table public.payment_gateway_settlements to service_role;
grant select, insert, update on table public.payment_gateway_settlement_items to service_role;

do $$
begin
  if to_regclass('public.razorpay_webhook_events') is not null
    and exists (select 1 from public.razorpay_webhook_events)
  then
    raise exception using
      errcode = 'P0001',
      message = 'razorpay_webhook_events is not empty. Refusing destructive prototype cleanup.';
  end if;
end $$;

drop table if exists public.razorpay_webhook_events;

alter table public.payments validate constraint payments_payment_provider_check;
