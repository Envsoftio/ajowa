alter table payment_allocations
  add column if not exists due_amount numeric(10,2) not null default 0,
  add column if not exists late_fee_component numeric(10,2) not null default 0,
  add column if not exists remaining_balance numeric(10,2) not null default 0,
  add column if not exists allocation_type text not null default 'PAYMENT';

alter table payments
  add column if not exists allocation_mode text not null default 'OLDEST_UNPAID_FIRST',
  add column if not exists allocation_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists transfer_kind text,
  add column if not exists receipt_generated_at timestamptz;

create table if not exists razorpay_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  gateway_payment_id text,
  gateway_order_id text,
  signature text,
  raw_payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists payment_adjustments (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete restrict,
  actor_user_id uuid references users(id) on delete restrict,
  reason text not null,
  before_allocations jsonb not null,
  after_allocations jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists razorpay_webhook_events_order_idx on razorpay_webhook_events (gateway_order_id);
create index if not exists razorpay_webhook_events_payment_idx on razorpay_webhook_events (gateway_payment_id);
create index if not exists payment_adjustments_payment_id_idx on payment_adjustments (payment_id);
