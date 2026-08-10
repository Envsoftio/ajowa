create table public.tenant_move_cases (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  flat_resident_id uuid not null references public.flat_residents(id) on delete restrict,
  tenant_user_id uuid not null references public.users(id) on delete restrict,
  flat_id uuid not null references public.flats(id) on delete restrict,
  status text not null default 'OCCUPIED',
  move_in_date date not null,
  expected_move_out_date date,
  actual_move_out_date date,
  expected_deposit_amount numeric(12,2) not null default 0,
  notes text,
  created_by_user_id uuid references public.users(id) on delete restrict,
  closed_by_user_id uuid references public.users(id) on delete restrict,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_move_cases_status_check check (
    status in (
      'OCCUPIED',
      'MOVE_OUT_REQUESTED',
      'REFUND_PENDING',
      'CLOSED',
      'CANCELLED'
    )
  ),
  constraint tenant_move_cases_expected_deposit_check check (
    expected_deposit_amount >= 0
  ),
  constraint tenant_move_cases_expected_move_out_check check (
    expected_move_out_date is null or expected_move_out_date >= move_in_date
  ),
  constraint tenant_move_cases_actual_move_out_check check (
    actual_move_out_date is null or actual_move_out_date >= move_in_date
  ),
  constraint tenant_move_cases_closed_state_check check (
    (status = 'CLOSED' and closed_at is not null and closed_by_user_id is not null)
    or (status <> 'CLOSED' and closed_at is null and closed_by_user_id is null)
  )
);

create unique index tenant_move_cases_open_relationship_uidx
  on public.tenant_move_cases (flat_resident_id)
  where status not in ('CLOSED', 'CANCELLED');

create index tenant_move_cases_flat_resident_id_idx
  on public.tenant_move_cases (flat_resident_id);

create index tenant_move_cases_society_status_date_idx
  on public.tenant_move_cases (society_id, status, move_in_date desc);

create index tenant_move_cases_tenant_user_id_idx
  on public.tenant_move_cases (tenant_user_id);

create index tenant_move_cases_flat_id_idx
  on public.tenant_move_cases (flat_id);

create index tenant_move_cases_created_by_idx
  on public.tenant_move_cases (created_by_user_id);

create index tenant_move_cases_closed_by_idx
  on public.tenant_move_cases (closed_by_user_id)
  where closed_by_user_id is not null;

create table public.tenant_deposit_receipts (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  move_case_id uuid not null references public.tenant_move_cases(id) on delete restrict,
  bank_account_id uuid not null references public.society_bank_accounts(id) on delete restrict,
  receipt_date date not null,
  receipt_number text not null unique,
  amount numeric(12,2) not null,
  mode text not null,
  reference_number text,
  notes text,
  created_by_user_id uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint tenant_deposit_receipts_amount_check check (amount > 0),
  constraint tenant_deposit_receipts_mode_check check (
    mode in ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD', 'OTHER')
  )
);

create index tenant_deposit_receipts_case_date_idx
  on public.tenant_deposit_receipts (move_case_id, receipt_date, created_at);

create index tenant_deposit_receipts_society_date_idx
  on public.tenant_deposit_receipts (society_id, receipt_date desc);

create index tenant_deposit_receipts_bank_account_id_idx
  on public.tenant_deposit_receipts (bank_account_id);

create index tenant_deposit_receipts_created_by_idx
  on public.tenant_deposit_receipts (created_by_user_id);

create unique index tenant_deposit_receipts_society_reference_uidx
  on public.tenant_deposit_receipts (society_id, lower(reference_number))
  where reference_number is not null and btrim(reference_number) <> '';

create table public.tenant_move_inspections (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  move_case_id uuid not null unique references public.tenant_move_cases(id) on delete restrict,
  inspection_date date not null,
  condition_rating text not null,
  condition_summary text not null,
  checklist jsonb not null default '{}'::jsonb,
  inspected_by_user_id uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_move_inspections_condition_check check (
    condition_rating in ('GOOD', 'DAMAGE_FOUND')
  ),
  constraint tenant_move_inspections_summary_check check (
    length(btrim(condition_summary)) >= 3
  )
);

create index tenant_move_inspections_society_date_idx
  on public.tenant_move_inspections (society_id, inspection_date desc);

create index tenant_move_inspections_inspected_by_idx
  on public.tenant_move_inspections (inspected_by_user_id);

create table public.tenant_deposit_deductions (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  move_case_id uuid not null references public.tenant_move_cases(id) on delete restrict,
  inspection_id uuid not null references public.tenant_move_inspections(id) on delete restrict,
  deduction_type text not null,
  amount numeric(12,2) not null,
  description text not null,
  created_by_user_id uuid references public.users(id) on delete restrict,
  voided_by_user_id uuid references public.users(id) on delete restrict,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_deposit_deductions_type_check check (
    deduction_type in ('DAMAGE', 'PENALTY')
  ),
  constraint tenant_deposit_deductions_amount_check check (amount > 0),
  constraint tenant_deposit_deductions_description_check check (
    length(btrim(description)) >= 3
  ),
  constraint tenant_deposit_deductions_void_check check (
    (voided_at is null and voided_by_user_id is null)
    or (voided_at is not null and voided_by_user_id is not null)
  )
);

create index tenant_deposit_deductions_active_case_idx
  on public.tenant_deposit_deductions (move_case_id, deduction_type)
  where voided_at is null;

create index tenant_deposit_deductions_move_case_id_idx
  on public.tenant_deposit_deductions (move_case_id);

create index tenant_deposit_deductions_society_id_idx
  on public.tenant_deposit_deductions (society_id);

create index tenant_deposit_deductions_inspection_id_idx
  on public.tenant_deposit_deductions (inspection_id);

create index tenant_deposit_deductions_created_by_idx
  on public.tenant_deposit_deductions (created_by_user_id);

create index tenant_deposit_deductions_voided_by_idx
  on public.tenant_deposit_deductions (voided_by_user_id)
  where voided_by_user_id is not null;

create table public.tenant_deposit_settlements (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  move_case_id uuid not null unique references public.tenant_move_cases(id) on delete restrict,
  bank_account_id uuid references public.society_bank_accounts(id) on delete restrict,
  income_transaction_id uuid unique references public.transactions(id) on delete restrict,
  settlement_date date not null,
  received_amount numeric(12,2) not null,
  damage_deduction_amount numeric(12,2) not null default 0,
  penalty_deduction_amount numeric(12,2) not null default 0,
  refund_amount numeric(12,2) not null default 0,
  refund_mode text,
  reference_number text,
  notes text,
  approved_by_user_id uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint tenant_deposit_settlements_amounts_check check (
    received_amount >= 0
    and damage_deduction_amount >= 0
    and penalty_deduction_amount >= 0
    and refund_amount >= 0
    and received_amount = damage_deduction_amount + penalty_deduction_amount + refund_amount
  ),
  constraint tenant_deposit_settlements_refund_details_check check (
    (refund_amount = 0 and bank_account_id is null and refund_mode is null)
    or (
      refund_amount > 0
      and bank_account_id is not null
      and refund_mode in ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD', 'OTHER')
    )
  )
);

create index tenant_deposit_settlements_society_date_idx
  on public.tenant_deposit_settlements (society_id, settlement_date desc);

create index tenant_deposit_settlements_bank_account_id_idx
  on public.tenant_deposit_settlements (bank_account_id)
  where bank_account_id is not null;

create index tenant_deposit_settlements_approved_by_idx
  on public.tenant_deposit_settlements (approved_by_user_id);

create unique index tenant_deposit_settlements_society_reference_uidx
  on public.tenant_deposit_settlements (society_id, lower(reference_number))
  where reference_number is not null and btrim(reference_number) <> '';

create table public.tenant_move_attachments (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.society_profile(id) on delete restrict,
  move_case_id uuid not null references public.tenant_move_cases(id) on delete restrict,
  attachment_type text not null,
  file_name text not null,
  file_path text not null unique,
  mime_type text not null,
  size_bytes integer not null,
  checksum text not null,
  uploaded_by_user_id uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint tenant_move_attachments_type_check check (
    attachment_type in ('MOVE_IN', 'INSPECTION', 'DAMAGE', 'REFUND')
  ),
  constraint tenant_move_attachments_size_check check (size_bytes > 0)
);

create index tenant_move_attachments_case_type_idx
  on public.tenant_move_attachments (move_case_id, attachment_type, created_at desc);

create index tenant_move_attachments_society_id_idx
  on public.tenant_move_attachments (society_id);

create index tenant_move_attachments_uploaded_by_idx
  on public.tenant_move_attachments (uploaded_by_user_id);

alter table public.journal_entries
  add column tenant_deposit_receipt_id uuid unique
    references public.tenant_deposit_receipts(id) on delete restrict,
  add column tenant_deposit_settlement_id uuid unique
    references public.tenant_deposit_settlements(id) on delete restrict;

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
  'LIAB-TEN-DEP',
  'Tenant Security Deposits',
  'LIABILITY'::account_head_type,
  true,
  true,
  false
from public.account_heads parent
where parent.code = 'SYS-LIABILITY'
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
  'INC-TEN-DED',
  'Tenant Deposit Deductions',
  'INCOME'::account_head_type,
  true,
  true,
  false
from public.account_heads parent
where parent.code = 'SYS-INCOME'
on conflict (code) do update
set
  society_id = null,
  parent_id = excluded.parent_id,
  name = excluded.name,
  head_type = excluded.head_type,
  is_system = true,
  is_active = true,
  allows_manual_entries = false;

insert into public.transaction_categories (
  society_id,
  code,
  name,
  transaction_type,
  category_group,
  account_head_id,
  requires_attachment,
  is_system,
  is_active
)
select
  null,
  'INC-TEN-DED-001',
  'Tenant Deposit Deductions',
  'INCOME'::transaction_type,
  'Move & Restoration',
  account_head.id,
  false,
  true,
  true
from public.account_heads account_head
where account_head.code = 'INC-TEN-DED'
on conflict (code) do update
set
  society_id = null,
  name = excluded.name,
  transaction_type = excluded.transaction_type,
  category_group = excluded.category_group,
  account_head_id = excluded.account_head_id,
  requires_attachment = excluded.requires_attachment,
  is_system = true,
  is_active = true;

drop trigger if exists tenant_move_cases_set_updated_at on public.tenant_move_cases;
create trigger tenant_move_cases_set_updated_at
  before update on public.tenant_move_cases
  for each row execute function public.set_updated_at();

drop trigger if exists tenant_move_inspections_set_updated_at on public.tenant_move_inspections;
create trigger tenant_move_inspections_set_updated_at
  before update on public.tenant_move_inspections
  for each row execute function public.set_updated_at();

drop trigger if exists tenant_deposit_deductions_set_updated_at on public.tenant_deposit_deductions;
create trigger tenant_deposit_deductions_set_updated_at
  before update on public.tenant_deposit_deductions
  for each row execute function public.set_updated_at();

alter table public.tenant_move_cases enable row level security;
alter table public.tenant_deposit_receipts enable row level security;
alter table public.tenant_move_inspections enable row level security;
alter table public.tenant_deposit_deductions enable row level security;
alter table public.tenant_deposit_settlements enable row level security;
alter table public.tenant_move_attachments enable row level security;

revoke all on table public.tenant_move_cases from anon, authenticated;
revoke all on table public.tenant_deposit_receipts from anon, authenticated;
revoke all on table public.tenant_move_inspections from anon, authenticated;
revoke all on table public.tenant_deposit_deductions from anon, authenticated;
revoke all on table public.tenant_deposit_settlements from anon, authenticated;
revoke all on table public.tenant_move_attachments from anon, authenticated;

revoke all on table public.tenant_move_cases from service_role;
revoke all on table public.tenant_deposit_receipts from service_role;
revoke all on table public.tenant_move_inspections from service_role;
revoke all on table public.tenant_deposit_deductions from service_role;
revoke all on table public.tenant_deposit_settlements from service_role;
revoke all on table public.tenant_move_attachments from service_role;

grant select, insert, update on table public.tenant_move_cases to service_role;
grant select, insert, update on table public.tenant_deposit_receipts to service_role;
grant select, insert, update on table public.tenant_move_inspections to service_role;
grant select, insert, update on table public.tenant_deposit_deductions to service_role;
grant select, insert, update on table public.tenant_deposit_settlements to service_role;
grant select, insert, update on table public.tenant_move_attachments to service_role;
