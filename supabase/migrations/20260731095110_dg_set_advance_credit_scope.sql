alter table resident_advance_credits
  add column if not exists applicable_charge_type text,
  add column if not exists source_billing_period_id uuid,
  add column if not exists is_liability_accounted boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'resident_advance_credits_applicable_charge_type_check'
      and conrelid = 'resident_advance_credits'::regclass
  ) then
    alter table resident_advance_credits
      add constraint resident_advance_credits_applicable_charge_type_check
      check (
        applicable_charge_type is null
        or applicable_charge_type in ('GENERAL', 'CAM', 'DG_SET')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'resident_advance_credits_source_billing_period_id_fkey'
      and conrelid = 'resident_advance_credits'::regclass
  ) then
    alter table resident_advance_credits
      add constraint resident_advance_credits_source_billing_period_id_fkey
      foreign key (source_billing_period_id)
      references billing_periods(id)
      on delete restrict;
  end if;
end $$;

with credit_sources as (
  select
    rac.id,
    case
      when count(pa.id) > 0 and bool_and(bp.charge_type = 'DG_SET')
        then 'DG_SET'
      else null
    end as applicable_charge_type,
    case
      when count(pa.id) > 0
        and bool_and(bp.charge_type = 'DG_SET')
        and count(distinct md.billing_period_id) = 1
        then (array_agg(distinct md.billing_period_id))[1]
      else null
    end as source_billing_period_id
  from resident_advance_credits rac
  inner join payment_allocations pa on pa.payment_id = rac.source_payment_id
  inner join maintenance_dues md on md.id = pa.maintenance_due_id
  inner join billing_periods bp on bp.id = md.billing_period_id
  where rac.applicable_charge_type is null
  group by rac.id
)
update resident_advance_credits rac
set
  applicable_charge_type = credit_sources.applicable_charge_type,
  source_billing_period_id = credit_sources.source_billing_period_id,
  updated_at = now()
from credit_sources
where rac.id = credit_sources.id
  and credit_sources.applicable_charge_type is not null;

create index if not exists resident_advance_credits_active_scope_idx
  on resident_advance_credits (
    society_id,
    flat_id,
    applicable_charge_type,
    created_at
  )
  where status = 'ACTIVE' and current_balance > 0;

create index if not exists resident_advance_credits_source_payment_id_idx
  on resident_advance_credits (source_payment_id)
  where source_payment_id is not null;

create index if not exists resident_advance_credits_source_billing_period_id_idx
  on resident_advance_credits (source_billing_period_id)
  where source_billing_period_id is not null;

insert into account_heads (
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
  'LIAB-RES-ADV',
  'Resident Advances',
  'LIABILITY'::account_head_type,
  true,
  true,
  false
from account_heads parent
where parent.code = 'SYS-LIABILITY'
on conflict (code) do update
set
  parent_id = excluded.parent_id,
  name = excluded.name,
  head_type = excluded.head_type,
  is_system = true,
  is_active = true,
  allows_manual_entries = false;
