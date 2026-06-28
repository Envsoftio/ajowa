create table if not exists expense_payments (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  transaction_id uuid not null references transactions(id) on delete restrict,
  bank_account_id uuid not null references society_bank_accounts(id) on delete restrict,
  payment_date date not null,
  amount numeric(10,2) not null,
  mode text not null,
  reference_number text,
  notes text,
  created_by_user_id uuid references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount > 0),
  check (mode in ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD', 'OTHER')),
  unique (transaction_id)
);

alter table journal_entries
  add column if not exists expense_payment_id uuid unique references expense_payments(id) on delete restrict;

create index if not exists expense_payments_society_payment_date_idx
  on expense_payments (society_id, payment_date desc);

create index if not exists expense_payments_transaction_id_idx
  on expense_payments (transaction_id);

create index if not exists expense_payments_bank_account_id_idx
  on expense_payments (bank_account_id);

create index if not exists journal_entries_expense_payment_id_idx
  on journal_entries (expense_payment_id);

drop trigger if exists expense_payments_set_updated_at on expense_payments;
create trigger expense_payments_set_updated_at
  before update on expense_payments
  for each row execute function set_updated_at();

alter table public.expense_payments enable row level security;
