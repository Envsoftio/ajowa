alter table billing_periods
  add column if not exists charge_type text not null default 'GENERAL';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'billing_periods_charge_type_check'
      and conrelid = 'billing_periods'::regclass
  ) then
    alter table billing_periods
      add constraint billing_periods_charge_type_check
      check (charge_type in ('GENERAL', 'CAM', 'DG_SET'));
  end if;
end $$;

alter table billing_periods
  drop constraint if exists billing_periods_society_id_start_date_end_date_key;

create unique index if not exists billing_periods_society_charge_type_dates_key
  on billing_periods (society_id, charge_type, start_date, end_date);

create index if not exists billing_periods_society_charge_type_idx
  on billing_periods (society_id, charge_type);
