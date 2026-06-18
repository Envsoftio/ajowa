do $$
begin
  create type maintenance_charge_calculation_method as enum ('FIXED', 'AREA_RATE');
exception
  when duplicate_object then null;
end;
$$;

alter table maintenance_charges
  add column if not exists calculation_method maintenance_charge_calculation_method not null default 'FIXED',
  add column if not exists rate_per_sq_ft numeric(10,4),
  add column if not exists calculation_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'maintenance_charges_area_rate_requires_rate'
      and conrelid = 'maintenance_charges'::regclass
  ) then
    alter table maintenance_charges
      add constraint maintenance_charges_area_rate_requires_rate
      check (
        calculation_method <> 'AREA_RATE'
        or (rate_per_sq_ft is not null and rate_per_sq_ft > 0)
      );
  end if;
end;
$$;
