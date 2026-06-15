create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

create type app_role as enum ('ADMIN', 'MANAGER', 'SERVICE_STAFF', 'RESIDENT', 'GUARD');
create type relationship_type as enum ('OWNER', 'TENANT', 'FAMILY_MEMBER');
create type owner_type as enum ('PRIMARY_OWNER', 'CO_OWNER');
create type occupancy_status as enum ('SELF_OCCUPIED', 'TENANTED', 'VACANT');
create type access_scope as enum ('OWNERSHIP', 'TENANCY', 'HOUSEHOLD');
create type notification_channel_preset as enum (
  'PUSH',
  'EMAIL',
  'WHATSAPP',
  'IN_APP',
  'PUSH_AND_EMAIL',
  'PUSH_AND_WHATSAPP',
  'EMAIL_AND_WHATSAPP',
  'PUSH_EMAIL_WHATSAPP',
  'ALL_CHANNELS'
);
create type billing_frequency as enum ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM');
create type maintenance_charge_scope as enum ('SOCIETY_DEFAULT', 'FLAT_TYPE', 'FLAT');
create type due_status as enum ('DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'WAIVED', 'OVERDUE', 'CANCELLED');
create type payment_mode as enum ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'ONLINE_GATEWAY', 'ADVANCE_CREDIT');
create type payment_status as enum ('INITIATED', 'PENDING_VERIFICATION', 'VERIFIED', 'FAILED', 'REFUNDED', 'CANCELLED');
create type advance_credit_status as enum ('ACTIVE', 'CONSUMED', 'ADJUSTED', 'EXPIRED', 'REVERSED');
create type advance_credit_action as enum ('CREATED', 'CONSUMED', 'ADJUSTED', 'REVERSED', 'EXPIRED');
create type access_token_status as enum ('ACTIVE', 'REVOKED', 'EXPIRED');
create type gate_scan_result as enum ('GRANTED', 'DENIED', 'EXPIRED', 'REVOKED', 'INVALID');
create type account_head_type as enum ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
create type transaction_type as enum ('INCOME', 'EXPENSE');
create type finance_lifecycle_status as enum ('DRAFT', 'PENDING_REVIEW', 'POSTED', 'REJECTED', 'RETURNED', 'REVERSED', 'CANCELLED');
create type journal_line_type as enum ('DEBIT', 'CREDIT');
create type parse_job_status as enum ('UPLOADED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED', 'CANCELLED');
create type service_priority as enum ('LOW', 'MEDIUM', 'HIGH', 'EMERGENCY');
create type service_request_status as enum (
  'OPEN',
  'ASSIGNED',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'ON_HOLD',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
  'NEEDS_REASSIGNMENT'
);
create type service_request_source as enum ('RESIDENT_REQUEST', 'COMMON_AREA_REPORT', 'STAFF_REPORTED', 'ADMIN_CREATED', 'SYSTEM_CREATED');
create type service_location_type as enum ('FLAT', 'COMMON_AREA', 'SOCIETY_ASSET');
create type service_visibility as enum ('RESIDENT_VISIBLE', 'INTERNAL_ONLY');
create type service_request_event_type as enum (
  'CREATED',
  'ASSIGNED',
  'REASSIGNED',
  'STATUS_CHANGED',
  'COMMENT_ADDED',
  'ATTACHMENT_ADDED',
  'SLA_BREACHED',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'SYSTEM_UPDATE'
);
create type comment_visibility as enum ('INTERNAL_NOTE', 'RESIDENT_VISIBLE', 'SYSTEM');
create type notice_status as enum ('DRAFT', 'PUBLISHED', 'ARCHIVED', 'CANCELLED');
create type notification_event_category as enum (
  'BILLING',
  'PAYMENTS',
  'ACCESS_QR',
  'SERVICE_REQUESTS',
  'NOTICES_ANNOUNCEMENTS',
  'ACCOUNT_ONBOARDING',
  'EMERGENCY_ALERTS'
);
create type notification_channel as enum ('PUSH', 'EMAIL', 'WHATSAPP', 'IN_APP');
create type notification_event_status as enum ('QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED', 'CANCELLED');
create type notification_job_status as enum ('QUEUED', 'RETRYING', 'SENT', 'DELIVERED', 'FAILED', 'READ', 'CANCELLED');
create type template_status as enum ('DRAFT', 'ACTIVE', 'ARCHIVED');
create type subscription_status as enum ('ACTIVE', 'REVOKED', 'EXPIRED');
create type delivery_status as enum ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'READ');
create type shared_report_type as enum (
  'INCOME_SUMMARY',
  'EXPENSE_SUMMARY',
  'INCOME_VS_EXPENSE',
  'CATEGORY_EXPENSE_SUMMARY',
  'FINANCIAL_STATEMENT'
);
create type share_delivery_state as enum ('PENDING', 'COPIED', 'EMAILED', 'WHATSAPP_SENT', 'REVOKED', 'EXPIRED');
create type audit_event_module as enum ('AUTH', 'MASTER', 'BILLING', 'PAYMENTS', 'ACCESS', 'FINANCE', 'SERVICE', 'NOTICE', 'NOTIFICATION', 'REPORT');
create type audit_event_severity as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
create type audit_entity_action as enum ('CREATED', 'UPDATED', 'DELETED', 'RESTORED', 'STATE_CHANGED');
create type document_sequence_type as enum ('RECEIPT', 'JOURNAL_VOUCHER', 'SERVICE_REQUEST');
create type verification_status as enum ('PENDING', 'VERIFIED', 'REJECTED', 'NOT_REQUIRED');

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function prevent_immutable_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'immutable audit table: % cannot be modified', tg_table_name;
end;
$$;

create or replace function next_yearly_sequence(
  p_document_type document_sequence_type,
  p_sequence_year integer
)
returns bigint
language plpgsql
as $$
declare
  v_next bigint;
begin
  insert into document_sequences (document_type, sequence_year, last_value, created_at, updated_at)
  values (p_document_type, p_sequence_year, 1, now(), now())
  on conflict (document_type, sequence_year)
  do update
    set last_value = document_sequences.last_value + 1,
        updated_at = now()
  returning last_value into v_next;

  return v_next;
end;
$$;

create or replace function ensure_valid_flat_resident()
returns trigger
language plpgsql
as $$
begin
  if new.relationship_type = 'TENANT' and (new.lease_start_date is null or new.lease_end_date is null) then
    raise exception 'tenant relationships require lease_start_date and lease_end_date';
  end if;

  if new.relationship_type <> 'TENANT' and (new.lease_start_date is not null or new.lease_end_date is not null) then
    raise exception 'lease dates are only valid for tenant relationships';
  end if;

  if new.relationship_type = 'OWNER' and new.access_scope is null then
    new.access_scope = 'OWNERSHIP';
  elsif new.relationship_type = 'TENANT' and new.access_scope is null then
    new.access_scope = 'TENANCY';
  elsif new.relationship_type = 'FAMILY_MEMBER' and new.access_scope is null then
    new.access_scope = 'HOUSEHOLD';
  end if;

  return new;
end;
$$;

create or replace function assert_open_billing_period()
returns trigger
language plpgsql
as $$
declare
  v_locked boolean;
begin
  if new.billing_period_id is null then
    return new;
  end if;

  select is_locked
  into v_locked
  from billing_periods
  where id = new.billing_period_id;

  if coalesce(v_locked, false) then
    raise exception 'billing period % is locked', new.billing_period_id;
  end if;

  return new;
end;
$$;

create or replace function assert_open_financial_period()
returns trigger
language plpgsql
as $$
declare
  v_date date;
  v_locked boolean;
begin
  v_date = coalesce(
    nullif(to_jsonb(new)->>'transaction_date', '')::date,
    nullif(to_jsonb(new)->>'entry_date', '')::date
  );

  if v_date is null then
    return new;
  end if;

  select exists (
    select 1
    from financial_period_close
    where start_date <= v_date
      and end_date >= v_date
      and is_reopened = false
  )
  into v_locked;

  if v_locked then
    raise exception 'financial period is closed for date %', v_date;
  end if;

  return new;
end;
$$;

create or replace function assert_allocation_due_period_open()
returns trigger
language plpgsql
as $$
declare
  v_locked boolean;
begin
  select bp.is_locked
  into v_locked
  from maintenance_dues md
  join billing_periods bp on bp.id = md.billing_period_id
  where md.id = new.maintenance_due_id;

  if coalesce(v_locked, false) then
    raise exception 'billing period is locked for due %', new.maintenance_due_id;
  end if;

  return new;
end;
$$;

create or replace function validate_posted_journal_entry()
returns trigger
language plpgsql
as $$
declare
  v_entry_id uuid;
  v_status finance_lifecycle_status;
  v_debit numeric(12,2);
  v_credit numeric(12,2);
  v_line_count integer;
begin
  v_entry_id = coalesce(new.journal_entry_id, old.journal_entry_id, new.id, old.id);

  if v_entry_id is null then
    return coalesce(new, old);
  end if;

  select status into v_status
  from journal_entries
  where id = v_entry_id;

  if v_status <> 'POSTED' then
    return coalesce(new, old);
  end if;

  select
    count(*),
    coalesce(sum(case when line_type = 'DEBIT' then amount else 0 end), 0),
    coalesce(sum(case when line_type = 'CREDIT' then amount else 0 end), 0)
  into v_line_count, v_debit, v_credit
  from journal_lines
  where journal_entry_id = v_entry_id;

  if v_line_count < 2 then
    raise exception 'posted journal entry % must have at least two lines', v_entry_id;
  end if;

  if v_debit <> v_credit then
    raise exception 'posted journal entry % is unbalanced (% <> %)', v_entry_id, v_debit, v_credit;
  end if;

  return coalesce(new, old);
end;
$$;

create table auth_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email citext not null unique,
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table auth_sessions (
  id uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  user_id uuid not null references auth_users(id) on delete cascade
);

create table auth_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  provider_id text not null,
  user_id uuid not null references auth_users(id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, account_id)
);

create table auth_verifications (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (identifier, value)
);

create table society_profile (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  registration_number text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  pincode text,
  logo_path text,
  contact_email citext,
  contact_phone text,
  timezone text not null default 'Asia/Kolkata',
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table blocks (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (society_id, code),
  unique (society_id, name)
);

create table flats (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  block_id uuid not null references blocks(id) on delete restrict,
  flat_number text not null,
  floor_label text,
  unit_type text not null,
  area_sq_ft numeric(10,2),
  occupancy_status occupancy_status not null default 'VACANT',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (area_sq_ft is null or area_sq_ft > 0),
  unique (block_id, flat_number)
);

create table users (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  auth_user_id uuid not null unique references auth_users(id) on delete restrict,
  role app_role not null,
  full_name text not null,
  email citext not null,
  mobile_number text not null,
  whatsapp_number text,
  profile_image_path text,
  can_login boolean not null default true,
  must_change_password boolean not null default false,
  email_verified boolean not null default false,
  is_active boolean not null default true,
  kyc_status verification_status not null default 'PENDING',
  police_verification_status verification_status not null default 'PENDING',
  government_id_type text,
  government_id_number text,
  government_id_document_path text,
  emergency_contact_name text,
  emergency_contact_number text,
  ownership_proof_path text,
  lease_agreement_path text,
  contract_start_date date,
  contract_end_date date,
  preferred_notification_channels notification_channel_preset not null default 'ALL_CHANNELS',
  notification_push_enabled boolean not null default true,
  notification_email_enabled boolean not null default true,
  notification_whatsapp_enabled boolean not null default true,
  notification_in_app_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contract_end_date is null or contract_start_date is null or contract_end_date >= contract_start_date),
  unique (society_id, email)
);

create table flat_residents (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references flats(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  relationship_type relationship_type not null,
  is_primary_contact boolean not null default false,
  is_billing_contact boolean not null default false,
  can_login boolean not null default true,
  is_active boolean not null default true,
  owner_type owner_type,
  ownership_percent numeric(5,2),
  ownership_label text,
  ownership_start_date date,
  lease_start_date date,
  lease_end_date date,
  contract_start_date date,
  contract_end_date date,
  occupancy_status occupancy_status,
  access_scope access_scope,
  relationship_note text,
  security_deposit_amount numeric(10,2),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ownership_percent is null or (ownership_percent > 0 and ownership_percent <= 100)),
  check (security_deposit_amount is null or security_deposit_amount >= 0),
  check (lease_end_date is null or lease_start_date is null or lease_end_date >= lease_start_date),
  check (contract_end_date is null or contract_start_date is null or contract_end_date >= contract_start_date)
);

create table billing_periods (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  label text not null,
  frequency billing_frequency not null,
  start_date date not null,
  end_date date not null,
  due_date date not null,
  is_locked boolean not null default false,
  locked_at timestamptz,
  lock_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (due_date >= start_date),
  unique (society_id, start_date, end_date)
);

create table maintenance_charges (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  billing_period_id uuid references billing_periods(id) on delete restrict,
  scope maintenance_charge_scope not null,
  flat_type text,
  flat_id uuid references flats(id) on delete restrict,
  charge_name text not null,
  amount numeric(10,2) not null,
  effective_start_date date,
  effective_end_date date,
  charge_breakdown jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount > 0),
  check (effective_end_date is null or effective_start_date is null or effective_end_date >= effective_start_date),
  check (
    (scope = 'SOCIETY_DEFAULT' and flat_type is null and flat_id is null)
    or (scope = 'FLAT_TYPE' and flat_type is not null and flat_id is null)
    or (scope = 'FLAT' and flat_id is not null)
  )
);

create table maintenance_dues (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  billing_period_id uuid not null references billing_periods(id) on delete restrict,
  flat_id uuid not null references flats(id) on delete restrict,
  due_date date not null,
  base_amount numeric(10,2) not null,
  late_fee_amount numeric(10,2) not null default 0,
  waived_amount numeric(10,2) not null default 0,
  paid_amount numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null,
  balance_amount numeric(10,2) not null,
  status due_status not null default 'OPEN',
  charge_breakdown jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (base_amount > 0),
  check (late_fee_amount >= 0),
  check (waived_amount >= 0),
  check (paid_amount >= 0),
  check (total_amount > 0),
  check (balance_amount >= 0),
  unique (billing_period_id, flat_id)
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  payer_user_id uuid not null references users(id) on delete restrict,
  received_for_flat_id uuid references flats(id) on delete restrict,
  mode payment_mode not null,
  status payment_status not null default 'INITIATED',
  payment_date date not null,
  amount numeric(10,2) not null,
  late_fee_component numeric(10,2) not null default 0,
  gateway_order_id text,
  gateway_payment_id text,
  gateway_webhook_event_id text,
  idempotency_key text,
  utr_reference text,
  bank_reference text,
  is_default_utr boolean not null default true,
  proof_file_path text,
  receipt_number text,
  receipt_file_path text,
  notes text,
  verified_by_user_id uuid references users(id) on delete restrict,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount > 0),
  check (late_fee_component >= 0)
);

create table payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete restrict,
  maintenance_due_id uuid not null references maintenance_dues(id) on delete restrict,
  allocated_amount numeric(10,2) not null,
  allocation_order integer not null default 1,
  created_at timestamptz not null default now(),
  check (allocated_amount > 0),
  unique (payment_id, maintenance_due_id)
);

create table resident_advance_credits (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  flat_id uuid not null references flats(id) on delete restrict,
  source_payment_id uuid references payments(id) on delete restrict,
  original_amount numeric(10,2) not null,
  current_balance numeric(10,2) not null,
  status advance_credit_status not null default 'ACTIVE',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (original_amount > 0),
  check (current_balance >= 0),
  check (current_balance <= original_amount)
);

create table resident_advance_credit_history (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references resident_advance_credits(id) on delete restrict,
  action advance_credit_action not null,
  amount numeric(10,2) not null,
  payment_id uuid references payments(id) on delete restrict,
  payment_allocation_id uuid references payment_allocations(id) on delete restrict,
  actor_user_id uuid references users(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  check (amount > 0)
);

create table access_tokens (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  billing_period_id uuid not null references billing_periods(id) on delete restrict,
  token_hash text not null unique,
  qr_payload jsonb not null default '{}'::jsonb,
  status access_token_status not null default 'ACTIVE',
  is_valid boolean not null default true,
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_access_status (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  billing_period_id uuid not null references billing_periods(id) on delete restrict,
  is_access_granted boolean not null default false,
  access_basis access_scope,
  unpaid_flat_numbers text[] not null default array[]::text[],
  total_flats integer not null default 0,
  total_paid_flats integer not null default 0,
  total_unpaid_flats integer not null default 0,
  total_due_all_flats numeric(10,2) not null default 0,
  total_paid_all_flats numeric(10,2) not null default 0,
  total_balance_all_flats numeric(10,2) not null default 0,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_due_all_flats >= 0),
  check (total_paid_all_flats >= 0),
  check (total_balance_all_flats >= 0),
  unique (user_id, billing_period_id)
);

create table gate_scan_logs (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  billing_period_id uuid references billing_periods(id) on delete restrict,
  user_id uuid references users(id) on delete restrict,
  flat_id uuid references flats(id) on delete restrict,
  access_token_id uuid references access_tokens(id) on delete set null,
  guard_user_id uuid references users(id) on delete set null,
  scan_result gate_scan_result not null,
  denial_reason text,
  gate_name text,
  device_id text,
  scan_payload jsonb not null default '{}'::jsonb,
  scanned_at timestamptz not null default now()
);

create table account_heads (
  id uuid primary key default gen_random_uuid(),
  society_id uuid references society_profile(id) on delete restrict,
  parent_id uuid references account_heads(id) on delete restrict,
  code text not null,
  name text not null,
  head_type account_head_type not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  allows_manual_entries boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code)
);

create table society_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  account_head_id uuid references account_heads(id) on delete restrict,
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  ifsc_code text not null,
  branch_name text,
  upi_id text,
  opening_balance numeric(10,2) not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (opening_balance >= 0),
  unique (account_number, ifsc_code)
);

create table transaction_categories (
  id uuid primary key default gen_random_uuid(),
  society_id uuid references society_profile(id) on delete restrict,
  code text not null unique,
  name text not null,
  transaction_type transaction_type not null,
  category_group text not null,
  requires_attachment boolean not null default false,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  transaction_type transaction_type not null,
  category_id uuid not null references transaction_categories(id) on delete restrict,
  bank_account_id uuid references society_bank_accounts(id) on delete restrict,
  billing_period_id uuid references billing_periods(id) on delete restrict,
  title text not null,
  description text,
  counterparty_name text,
  voucher_number text,
  transaction_date date not null,
  amount numeric(10,2) not null,
  status finance_lifecycle_status not null default 'DRAFT',
  source_payment_id uuid references payments(id) on delete restrict,
  created_by_user_id uuid references users(id) on delete restrict,
  approved_by_user_id uuid references users(id) on delete restrict,
  approved_at timestamptz,
  posted_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount > 0)
);

create table transaction_attachments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete restrict,
  file_name text not null,
  file_path text not null,
  mime_type text not null,
  size_bytes integer not null,
  checksum text,
  uploaded_by_user_id uuid references users(id) on delete restrict,
  replaces_attachment_id uuid references transaction_attachments(id) on delete restrict,
  replaced_at timestamptz,
  created_at timestamptz not null default now(),
  check (size_bytes > 0)
);

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  voucher_number text not null unique,
  transaction_id uuid unique references transactions(id) on delete restrict,
  payment_id uuid unique references payments(id) on delete restrict,
  billing_period_id uuid references billing_periods(id) on delete restrict,
  entry_date date not null,
  description text,
  status finance_lifecycle_status not null default 'DRAFT',
  posted_by_user_id uuid references users(id) on delete restrict,
  posted_at timestamptz,
  reversal_of_entry_id uuid references journal_entries(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  line_no integer not null,
  account_head_id uuid not null references account_heads(id) on delete restrict,
  line_type journal_line_type not null,
  amount numeric(10,2) not null,
  description text,
  created_at timestamptz not null default now(),
  check (amount > 0),
  unique (journal_entry_id, line_no)
);

create table financial_period_close (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  notes text,
  closed_at timestamptz not null default now(),
  closed_by_user_id uuid references users(id) on delete restrict,
  is_reopened boolean not null default false,
  reopened_at timestamptz,
  reopened_by_user_id uuid references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (society_id, start_date, end_date)
);

create table invoice_parse_jobs (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  transaction_id uuid references transactions(id) on delete restrict,
  upload_path text not null,
  status parse_job_status not null default 'UPLOADED',
  requested_by_user_id uuid references users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  result_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table service_departments (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  allows_queue_visibility boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (society_id, code),
  unique (society_id, name)
);

create table service_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references service_departments(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, user_id)
);

create table service_sla_rules (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  department_id uuid references service_departments(id) on delete restrict,
  priority service_priority not null,
  acknowledge_within_minutes integer not null,
  resolve_within_minutes integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (acknowledge_within_minutes > 0),
  check (resolve_within_minutes > 0)
);

create table service_category_routes (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  category_key text not null,
  category_label text not null,
  location_type service_location_type,
  department_id uuid not null references service_departments(id) on delete restrict,
  default_priority service_priority,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table service_requests (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  request_number text not null unique,
  requester_user_id uuid references users(id) on delete restrict,
  flat_id uuid references flats(id) on delete restrict,
  department_id uuid references service_departments(id) on delete restrict,
  assignee_user_id uuid references users(id) on delete restrict,
  category text not null,
  title text not null,
  description text not null,
  source_type service_request_source not null,
  location_type service_location_type not null,
  area_name text,
  asset_reference text,
  priority service_priority not null default 'MEDIUM',
  status service_request_status not null default 'OPEN',
  visibility service_visibility not null default 'RESIDENT_VISIBLE',
  first_response_due_at timestamptz,
  due_by_at timestamptz,
  first_responded_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  reopened_at timestamptz,
  escalation_level integer not null default 0,
  is_sla_breached boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table service_request_assignments (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references service_requests(id) on delete cascade,
  department_id uuid not null references service_departments(id) on delete restrict,
  assignee_user_id uuid references users(id) on delete restrict,
  assigned_by_user_id uuid references users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  notes text
);

create table service_request_events (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references service_requests(id) on delete cascade,
  event_type service_request_event_type not null,
  actor_user_id uuid references users(id) on delete set null,
  visibility comment_visibility not null default 'SYSTEM',
  from_status service_request_status,
  to_status service_request_status,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table service_request_comments (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references service_requests(id) on delete cascade,
  author_user_id uuid references users(id) on delete set null,
  visibility comment_visibility not null default 'RESIDENT_VISIBLE',
  comment_body text not null,
  created_at timestamptz not null default now()
);

create table service_request_attachments (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references service_requests(id) on delete cascade,
  uploaded_by_user_id uuid references users(id) on delete set null,
  file_name text not null,
  file_path text not null,
  mime_type text not null,
  size_bytes integer not null,
  checksum text,
  created_at timestamptz not null default now(),
  check (size_bytes > 0)
);

create table notices (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  title text not null,
  summary text,
  body text not null,
  priority service_priority not null default 'MEDIUM',
  status notice_status not null default 'DRAFT',
  audience_scope text,
  deep_link_url text,
  is_pinned boolean not null default false,
  published_at timestamptz,
  expires_at timestamptz,
  created_by_user_id uuid references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notification_events (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  event_key text not null,
  category notification_event_category not null,
  source_table text,
  source_id uuid,
  priority service_priority not null default 'MEDIUM',
  title text,
  body text,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text,
  status notification_event_status not null default 'QUEUED',
  triggered_by_user_id uuid references users(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create table notification_audiences (
  id uuid primary key default gen_random_uuid(),
  notification_event_id uuid not null references notification_events(id) on delete cascade,
  target_user_id uuid references users(id) on delete set null,
  target_flat_id uuid references flats(id) on delete set null,
  channel notification_channel not null,
  resolved_address text,
  audience_label text,
  filters_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table notification_jobs (
  id uuid primary key default gen_random_uuid(),
  notification_event_id uuid not null references notification_events(id) on delete cascade,
  audience_id uuid references notification_audiences(id) on delete set null,
  channel notification_channel not null,
  status notification_job_status not null default 'QUEUED',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  provider_message_id text,
  dedupe_key text not null unique,
  priority service_priority not null default 'MEDIUM',
  failure_reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_attempts > 0),
  check (attempt_count >= 0)
);

create table notification_templates (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  event_key text not null,
  channel notification_channel not null,
  version integer not null,
  template_name text not null,
  subject_template text,
  body_template text not null,
  plain_text_template text,
  variables_schema jsonb not null default '[]'::jsonb,
  is_active boolean not null default false,
  is_default boolean not null default false,
  status template_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_key, channel, version)
);

create table notification_event_settings (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  event_key text not null,
  category notification_event_category not null,
  push_enabled boolean not null default false,
  email_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  in_app_enabled boolean not null default true,
  recipient_scope text,
  cooldown_minutes integer not null default 0,
  priority service_priority not null default 'MEDIUM',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cooldown_minutes >= 0),
  unique (society_id, event_key)
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  device_label text,
  status subscription_status not null default 'ACTIVE',
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  user_id uuid not null references users(id) on delete cascade,
  event_category notification_event_category not null,
  push_enabled boolean not null default true,
  email_enabled boolean not null default true,
  whatsapp_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  fallback_to_mobile_for_whatsapp boolean not null default false,
  preferred_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_category)
);

create table notification_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  notification_job_id uuid not null references notification_jobs(id) on delete cascade,
  provider_name text,
  provider_message_id text,
  channel notification_channel not null,
  status delivery_status not null,
  attempt_number integer not null default 1,
  response_code text,
  response_body jsonb not null default '{}'::jsonb,
  failure_reason text,
  delivered_at timestamptz,
  read_at timestamptz,
  logged_at timestamptz not null default now(),
  check (attempt_number > 0)
);

create table in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  user_id uuid not null references users(id) on delete cascade,
  notification_event_id uuid references notification_events(id) on delete set null,
  title text not null,
  body text not null,
  deep_link_url text,
  priority service_priority not null default 'MEDIUM',
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table shared_report_links (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  owner_user_id uuid not null references users(id) on delete restrict,
  report_type shared_report_type not null,
  start_date date not null,
  end_date date not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by_user_id uuid references users(id) on delete restrict,
  one_time_access boolean not null default false,
  access_count integer not null default 0,
  last_accessed_at timestamptz,
  delivery_state share_delivery_state not null default 'PENDING',
  delivery_channels text[] not null default array[]::text[],
  created_by_user_id uuid references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (end_date >= start_date),
  check (access_count >= 0)
);

create table document_sequences (
  id uuid primary key default gen_random_uuid(),
  document_type document_sequence_type not null,
  sequence_year integer not null,
  last_value bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sequence_year >= 2000),
  check (last_value >= 0),
  unique (document_type, sequence_year)
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  society_id uuid references society_profile(id) on delete restrict,
  module audit_event_module not null,
  event_key text not null,
  action audit_entity_action not null,
  severity audit_event_severity not null default 'MEDIUM',
  actor_user_id uuid references users(id) on delete set null,
  actor_auth_user_id uuid references auth_users(id) on delete set null,
  request_id text,
  ip_address text,
  user_agent text,
  flat_id uuid references flats(id) on delete set null,
  target_user_id uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz not null default now()
);

create table audit_event_entities (
  id uuid primary key default gen_random_uuid(),
  audit_event_id uuid not null references audit_events(id) on delete cascade,
  entity_table text not null,
  entity_id uuid not null,
  entity_label text,
  created_at timestamptz not null default now()
);

create unique index flat_residents_one_billing_contact_idx
  on flat_residents (flat_id)
  where is_active = true and is_billing_contact = true;

create unique index access_tokens_one_active_per_period_idx
  on access_tokens (user_id, billing_period_id)
  where status = 'ACTIVE' and is_valid = true;

create unique index payments_gateway_order_idx
  on payments (gateway_order_id)
  where gateway_order_id is not null;

create unique index payments_gateway_payment_idx
  on payments (gateway_payment_id)
  where gateway_payment_id is not null;

create unique index payments_gateway_webhook_event_idx
  on payments (gateway_webhook_event_id)
  where gateway_webhook_event_id is not null;

create unique index payments_idempotency_key_idx
  on payments (idempotency_key)
  where idempotency_key is not null;

create unique index payments_default_utr_idx
  on payments (lower(utr_reference))
  where utr_reference is not null and is_default_utr = true;

create index auth_sessions_user_id_idx on auth_sessions (user_id);
create index auth_verifications_identifier_idx on auth_verifications (identifier);
create index blocks_society_id_idx on blocks (society_id);
create index flats_society_id_idx on flats (society_id);
create index flats_block_id_idx on flats (block_id);
create index flats_occupancy_status_idx on flats (occupancy_status);
create index users_society_id_idx on users (society_id);
create index users_role_idx on users (role);
create index users_is_active_idx on users (is_active);
create index flat_residents_flat_id_idx on flat_residents (flat_id);
create index flat_residents_user_id_idx on flat_residents (user_id);
create index flat_residents_relationship_type_idx on flat_residents (relationship_type);
create index flat_residents_is_active_idx on flat_residents (is_active);
create index billing_periods_society_id_idx on billing_periods (society_id);
create index billing_periods_locked_idx on billing_periods (is_locked);
create index maintenance_charges_society_id_idx on maintenance_charges (society_id);
create index maintenance_charges_billing_period_id_idx on maintenance_charges (billing_period_id);
create index maintenance_dues_billing_period_id_idx on maintenance_dues (billing_period_id);
create index maintenance_dues_flat_id_idx on maintenance_dues (flat_id);
create index maintenance_dues_status_idx on maintenance_dues (status);
create index maintenance_dues_due_date_idx on maintenance_dues (due_date);
create index payments_society_id_idx on payments (society_id);
create index payments_payer_user_id_idx on payments (payer_user_id);
create index payments_received_for_flat_id_idx on payments (received_for_flat_id);
create index payments_status_idx on payments (status);
create index payments_payment_date_idx on payments (payment_date);
create index payments_utr_reference_idx on payments (utr_reference);
create index payment_allocations_payment_id_idx on payment_allocations (payment_id);
create index payment_allocations_maintenance_due_id_idx on payment_allocations (maintenance_due_id);
create index resident_advance_credits_user_id_idx on resident_advance_credits (user_id);
create index resident_advance_credits_flat_id_idx on resident_advance_credits (flat_id);
create index resident_advance_credits_status_idx on resident_advance_credits (status);
create index resident_advance_credit_history_credit_id_idx on resident_advance_credit_history (credit_id);
create index access_tokens_user_id_idx on access_tokens (user_id);
create index access_tokens_billing_period_id_idx on access_tokens (billing_period_id);
create index access_tokens_status_idx on access_tokens (status);
create index user_access_status_user_id_idx on user_access_status (user_id);
create index user_access_status_billing_period_id_idx on user_access_status (billing_period_id);
create index gate_scan_logs_billing_period_id_idx on gate_scan_logs (billing_period_id);
create index gate_scan_logs_user_id_idx on gate_scan_logs (user_id);
create index gate_scan_logs_flat_id_idx on gate_scan_logs (flat_id);
create index gate_scan_logs_scanned_at_idx on gate_scan_logs (scanned_at);
create index account_heads_parent_id_idx on account_heads (parent_id);
create index account_heads_head_type_idx on account_heads (head_type);
create index society_bank_accounts_society_id_idx on society_bank_accounts (society_id);
create index transaction_categories_transaction_type_idx on transaction_categories (transaction_type);
create index transactions_category_id_idx on transactions (category_id);
create index transactions_bank_account_id_idx on transactions (bank_account_id);
create index transactions_billing_period_id_idx on transactions (billing_period_id);
create index transactions_status_idx on transactions (status);
create index transactions_transaction_date_idx on transactions (transaction_date);
create index transaction_attachments_transaction_id_idx on transaction_attachments (transaction_id);
create index journal_entries_transaction_id_idx on journal_entries (transaction_id);
create index journal_entries_payment_id_idx on journal_entries (payment_id);
create index journal_entries_billing_period_id_idx on journal_entries (billing_period_id);
create index journal_entries_status_idx on journal_entries (status);
create index journal_entries_entry_date_idx on journal_entries (entry_date);
create index journal_lines_journal_entry_id_idx on journal_lines (journal_entry_id);
create index journal_lines_account_head_id_idx on journal_lines (account_head_id);
create index financial_period_close_society_id_idx on financial_period_close (society_id);
create index invoice_parse_jobs_transaction_id_idx on invoice_parse_jobs (transaction_id);
create index invoice_parse_jobs_status_idx on invoice_parse_jobs (status);
create index service_staff_assignments_department_id_idx on service_staff_assignments (department_id);
create index service_staff_assignments_user_id_idx on service_staff_assignments (user_id);
create index service_requests_requester_user_id_idx on service_requests (requester_user_id);
create index service_requests_flat_id_idx on service_requests (flat_id);
create index service_requests_department_id_idx on service_requests (department_id);
create index service_requests_assignee_user_id_idx on service_requests (assignee_user_id);
create index service_requests_status_idx on service_requests (status);
create index service_requests_priority_idx on service_requests (priority);
create index service_requests_created_at_idx on service_requests (created_at);
create index service_request_assignments_service_request_id_idx on service_request_assignments (service_request_id);
create index service_request_events_service_request_id_idx on service_request_events (service_request_id);
create index service_request_comments_service_request_id_idx on service_request_comments (service_request_id);
create index service_request_attachments_service_request_id_idx on service_request_attachments (service_request_id);
create index notices_society_id_idx on notices (society_id);
create index notices_status_idx on notices (status);
create index notices_published_at_idx on notices (published_at);
create index notification_events_category_idx on notification_events (category);
create index notification_events_status_idx on notification_events (status);
create index notification_events_created_at_idx on notification_events (created_at);
create index notification_audiences_notification_event_id_idx on notification_audiences (notification_event_id);
create index notification_jobs_notification_event_id_idx on notification_jobs (notification_event_id);
create index notification_jobs_status_idx on notification_jobs (status);
create index notification_jobs_channel_idx on notification_jobs (channel);
create index notification_jobs_next_attempt_at_idx on notification_jobs (next_attempt_at);
create index notification_templates_event_channel_idx on notification_templates (event_key, channel);
create index push_subscriptions_user_id_idx on push_subscriptions (user_id);
create index push_subscriptions_status_idx on push_subscriptions (status);
create index user_notification_preferences_user_id_idx on user_notification_preferences (user_id);
create index notification_delivery_logs_notification_job_id_idx on notification_delivery_logs (notification_job_id);
create index in_app_notifications_user_id_idx on in_app_notifications (user_id);
create index in_app_notifications_is_read_idx on in_app_notifications (is_read);
create index shared_report_links_owner_user_id_idx on shared_report_links (owner_user_id);
create index shared_report_links_expires_at_idx on shared_report_links (expires_at);
create index audit_events_module_idx on audit_events (module);
create index audit_events_actor_user_id_idx on audit_events (actor_user_id);
create index audit_events_target_user_id_idx on audit_events (target_user_id);
create index audit_events_flat_id_idx on audit_events (flat_id);
create index audit_events_occurred_at_idx on audit_events (occurred_at);
create index audit_event_entities_audit_event_id_idx on audit_event_entities (audit_event_id);
create index audit_event_entities_entity_lookup_idx on audit_event_entities (entity_table, entity_id);

create trigger auth_users_set_updated_at before update on auth_users for each row execute function set_updated_at();
create trigger auth_sessions_set_updated_at before update on auth_sessions for each row execute function set_updated_at();
create trigger auth_accounts_set_updated_at before update on auth_accounts for each row execute function set_updated_at();
create trigger auth_verifications_set_updated_at before update on auth_verifications for each row execute function set_updated_at();
create trigger society_profile_set_updated_at before update on society_profile for each row execute function set_updated_at();
create trigger blocks_set_updated_at before update on blocks for each row execute function set_updated_at();
create trigger flats_set_updated_at before update on flats for each row execute function set_updated_at();
create trigger users_set_updated_at before update on users for each row execute function set_updated_at();
create trigger flat_residents_set_updated_at before update on flat_residents for each row execute function set_updated_at();
create trigger flat_residents_validate before insert or update on flat_residents for each row execute function ensure_valid_flat_resident();
create constraint trigger flat_residents_owner_percentages_complete
  after insert or update or delete on flat_residents
  deferrable initially deferred
  for each row
  execute function validate_owner_percentages_complete();
create trigger billing_periods_set_updated_at before update on billing_periods for each row execute function set_updated_at();
create trigger maintenance_charges_set_updated_at before update on maintenance_charges for each row execute function set_updated_at();
create trigger maintenance_dues_set_updated_at before update on maintenance_dues for each row execute function set_updated_at();
create trigger maintenance_dues_open_period before insert or update on maintenance_dues for each row execute function assert_open_billing_period();
create trigger payments_set_updated_at before update on payments for each row execute function set_updated_at();
create trigger payment_allocations_open_due_period before insert or update on payment_allocations for each row execute function assert_allocation_due_period_open();
create trigger resident_advance_credits_set_updated_at before update on resident_advance_credits for each row execute function set_updated_at();
create trigger access_tokens_set_updated_at before update on access_tokens for each row execute function set_updated_at();
create trigger user_access_status_set_updated_at before update on user_access_status for each row execute function set_updated_at();
create trigger account_heads_set_updated_at before update on account_heads for each row execute function set_updated_at();
create trigger society_bank_accounts_set_updated_at before update on society_bank_accounts for each row execute function set_updated_at();
create trigger transaction_categories_set_updated_at before update on transaction_categories for each row execute function set_updated_at();
create trigger transactions_set_updated_at before update on transactions for each row execute function set_updated_at();
create trigger transactions_open_period before insert or update on transactions for each row execute function assert_open_financial_period();
create trigger journal_entries_set_updated_at before update on journal_entries for each row execute function set_updated_at();
create trigger journal_entries_open_billing_period before insert or update on journal_entries for each row execute function assert_open_billing_period();
create trigger journal_entries_open_financial_period before insert or update on journal_entries for each row execute function assert_open_financial_period();
create trigger financial_period_close_set_updated_at before update on financial_period_close for each row execute function set_updated_at();
create trigger invoice_parse_jobs_set_updated_at before update on invoice_parse_jobs for each row execute function set_updated_at();
create trigger service_departments_set_updated_at before update on service_departments for each row execute function set_updated_at();
create trigger service_staff_assignments_set_updated_at before update on service_staff_assignments for each row execute function set_updated_at();
create trigger service_sla_rules_set_updated_at before update on service_sla_rules for each row execute function set_updated_at();
create trigger service_category_routes_set_updated_at before update on service_category_routes for each row execute function set_updated_at();
create trigger service_requests_set_updated_at before update on service_requests for each row execute function set_updated_at();
create trigger notices_set_updated_at before update on notices for each row execute function set_updated_at();
create trigger notification_events_set_updated_at before update on notification_events for each row execute function set_updated_at();
create trigger notification_jobs_set_updated_at before update on notification_jobs for each row execute function set_updated_at();
create trigger notification_templates_set_updated_at before update on notification_templates for each row execute function set_updated_at();
create trigger notification_event_settings_set_updated_at before update on notification_event_settings for each row execute function set_updated_at();
create trigger push_subscriptions_set_updated_at before update on push_subscriptions for each row execute function set_updated_at();
create trigger user_notification_preferences_set_updated_at before update on user_notification_preferences for each row execute function set_updated_at();
create trigger document_sequences_set_updated_at before update on document_sequences for each row execute function set_updated_at();

create trigger audit_events_immutable
  before update or delete on audit_events
  for each row
  execute function prevent_immutable_change();

create trigger audit_event_entities_immutable
  before update or delete on audit_event_entities
  for each row
  execute function prevent_immutable_change();

create constraint trigger posted_journal_balance_on_lines
  after insert or update or delete on journal_lines
  deferrable initially deferred
  for each row
  execute function validate_posted_journal_entry();

create constraint trigger posted_journal_balance_on_entries
  after insert or update on journal_entries
  deferrable initially deferred
  for each row
  execute function validate_posted_journal_entry();
