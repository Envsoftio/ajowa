alter table payments
  add column if not exists charge_type text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_charge_type_check'
      and conrelid = 'payments'::regclass
  ) then
    alter table payments
      add constraint payments_charge_type_check
      check (
        charge_type is null
        or charge_type in ('GENERAL', 'CAM', 'DG_SET')
      );
  end if;
end $$;

with allocation_scopes as (
  select
    pa.payment_id,
    min(bp.charge_type::text) as charge_type
  from payment_allocations pa
  inner join maintenance_dues md on md.id = pa.maintenance_due_id
  inner join billing_periods bp on bp.id = md.billing_period_id
  group by pa.payment_id
  having count(distinct bp.charge_type) = 1
)
update payments p
set charge_type = allocation_scopes.charge_type,
    updated_at = now()
from allocation_scopes
where p.id = allocation_scopes.payment_id
  and p.charge_type is null;

with credit_scopes as (
  select
    rac.source_payment_id as payment_id,
    min(rac.applicable_charge_type) as charge_type
  from resident_advance_credits rac
  where rac.source_payment_id is not null
    and rac.applicable_charge_type is not null
  group by rac.source_payment_id
  having count(distinct rac.applicable_charge_type) = 1
)
update payments p
set charge_type = credit_scopes.charge_type,
    updated_at = now()
from credit_scopes
where p.id = credit_scopes.payment_id
  and p.charge_type is null;

create temporary table legacy_cam_credit_classification
on commit drop
as
select
  rac.id as credit_id,
  rac.society_id,
  rac.flat_id,
  rac.source_payment_id,
  rac.current_balance
from resident_advance_credits rac
where rac.applicable_charge_type is null
  and rac.status = 'ACTIVE'
  and rac.current_balance > 0
  and rac.current_balance = rac.original_amount
  and exists (
    select 1
    from payment_allocations pa
    where pa.payment_id = rac.source_payment_id
  )
  and not exists (
    select 1
    from payment_allocations pa
    inner join maintenance_dues md on md.id = pa.maintenance_due_id
    inner join billing_periods bp on bp.id = md.billing_period_id
    where pa.payment_id = rac.source_payment_id
      and bp.charge_type <> 'CAM'
  )
  and not exists (
    select 1
    from resident_advance_credit_history history
    where history.credit_id = rac.id
      and history.action <> 'CREATED'
  );

insert into resident_advance_credit_history (
  credit_id,
  action,
  amount,
  payment_id,
  notes
)
select
  candidate.credit_id,
  'ADJUSTED',
  candidate.current_balance,
  candidate.source_payment_id,
  'Legacy classification from unscoped to CAM; source payment allocations were exclusively CAM. Migration: cam_dg_payment_isolation.'
from legacy_cam_credit_classification candidate;

update resident_advance_credits rac
set applicable_charge_type = 'CAM',
    updated_at = now()
from legacy_cam_credit_classification candidate
where rac.id = candidate.credit_id;

insert into audit_events (
  society_id,
  module,
  event_key,
  action,
  severity,
  flat_id,
  metadata,
  before_state,
  after_state
)
select
  candidate.society_id,
  'PAYMENTS',
  'resident_advance_credit.scope_classified',
  'UPDATED',
  'HIGH',
  candidate.flat_id,
  jsonb_build_object(
    'creditId', candidate.credit_id,
    'paymentId', candidate.source_payment_id,
    'migration', 'cam_dg_payment_isolation',
    'evidence', 'CAM_ONLY_SOURCE_ALLOCATIONS'
  ),
  jsonb_build_object(
    'applicableChargeType', null,
    'currentBalance', candidate.current_balance
  ),
  jsonb_build_object(
    'applicableChargeType', 'CAM',
    'currentBalance', candidate.current_balance
  )
from legacy_cam_credit_classification candidate;

update payments p
set charge_type = rac.applicable_charge_type,
    updated_at = now()
from resident_advance_credits rac
where rac.source_payment_id = p.id
  and rac.applicable_charge_type is not null
  and p.charge_type is null;

-- These receipts are intentionally CAM payments. Their mixed allocations are
-- repaired through the application payment-edit workflow after this migration.
update payments
set charge_type = 'CAM',
    updated_at = now()
where id in (
  '0b584a22-c2ba-4dc5-8abd-17fcfdb8021c',
  'c0f59c5e-9303-4fba-9c29-0bcb31d860c4'
)
  and charge_type is null;

create index if not exists payments_society_charge_type_payment_date_idx
  on payments (society_id, charge_type, payment_date desc, created_at desc);

create or replace function require_new_payment_charge_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.charge_type is null and tg_op = 'INSERT' then
    raise exception 'A payment charge type is required.'
      using errcode = '23514';
  end if;

  if new.charge_type is null and old.charge_type is not null then
    raise exception 'A classified payment cannot be made unclassified.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_require_charge_type on payments;
create trigger payments_require_charge_type
  before insert or update of charge_type on payments
  for each row
  execute function require_new_payment_charge_type();

create or replace function assert_payment_allocation_charge_type()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  payment_charge_type text;
  due_charge_type text;
begin
  select p.charge_type
  into payment_charge_type
  from payments p
  where p.id = new.payment_id;

  select bp.charge_type::text
  into due_charge_type
  from maintenance_dues md
  inner join billing_periods bp on bp.id = md.billing_period_id
  where md.id = new.maintenance_due_id;

  if payment_charge_type is null then
    raise exception 'Payment % must be classified before allocation.', new.payment_id
      using errcode = '23514';
  end if;

  if due_charge_type is distinct from payment_charge_type then
    raise exception 'Payment type % cannot be allocated to % due %.',
      payment_charge_type,
      due_charge_type,
      new.maintenance_due_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists payment_allocations_charge_type_guard on payment_allocations;
create trigger payment_allocations_charge_type_guard
  before insert or update of payment_id, maintenance_due_id on payment_allocations
  for each row
  execute function assert_payment_allocation_charge_type();
