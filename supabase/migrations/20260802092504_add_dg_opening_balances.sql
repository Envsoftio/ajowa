alter table maintenance_dues
  add column if not exists origin text not null default 'GENERATED_BILL',
  add column if not exists opening_balance_as_of date,
  add column if not exists opening_balance_note text,
  add column if not exists opening_balance_created_by_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'maintenance_dues_origin_check'
      and conrelid = 'maintenance_dues'::regclass
  ) then
    alter table maintenance_dues
      add constraint maintenance_dues_origin_check
      check (origin in ('GENERATED_BILL', 'DG_OPENING_BALANCE'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'maintenance_dues_opening_balance_fields_check'
      and conrelid = 'maintenance_dues'::regclass
  ) then
    alter table maintenance_dues
      add constraint maintenance_dues_opening_balance_fields_check
      check (
        (
          origin = 'GENERATED_BILL'
          and opening_balance_as_of is null
          and opening_balance_note is null
          and opening_balance_created_by_user_id is null
        )
        or (
          origin = 'DG_OPENING_BALANCE'
          and opening_balance_as_of is not null
          and nullif(btrim(opening_balance_note), '') is not null
          and opening_balance_created_by_user_id is not null
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'maintenance_dues_opening_balance_created_by_fkey'
      and conrelid = 'maintenance_dues'::regclass
  ) then
    alter table maintenance_dues
      add constraint maintenance_dues_opening_balance_created_by_fkey
      foreign key (opening_balance_created_by_user_id)
      references users(id)
      on delete restrict;
  end if;
end $$;

create index if not exists maintenance_dues_open_dg_fifo_idx
  on maintenance_dues (society_id, flat_id, due_date, id)
  where balance_amount > 0
    and status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE');

create index if not exists maintenance_dues_opening_balance_created_by_idx
  on maintenance_dues (opening_balance_created_by_user_id)
  where opening_balance_created_by_user_id is not null;

create index if not exists maintenance_dues_dg_opening_balance_idx
  on maintenance_dues (society_id, opening_balance_as_of, flat_id)
  where origin = 'DG_OPENING_BALANCE';
