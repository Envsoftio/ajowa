alter table society_bank_accounts
  add column if not exists account_type text not null default 'CURRENT';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'society_bank_accounts_account_type_check'
  ) then
    alter table society_bank_accounts
      add constraint society_bank_accounts_account_type_check
      check (account_type in ('SAVINGS', 'CURRENT', 'CASH_CREDIT', 'OVERDRAFT', 'OTHER'));
  end if;
end $$;

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
values
  (null, null, 'SYS-ASSET', 'Assets', 'ASSET', true, true, false),
  (null, null, 'SYS-LIABILITY', 'Liabilities', 'LIABILITY', true, true, false),
  (null, null, 'SYS-EQUITY', 'Equity', 'EQUITY', true, true, false),
  (null, null, 'SYS-INCOME', 'Income', 'INCOME', true, true, false),
  (null, null, 'SYS-EXPENSE', 'Expenses', 'EXPENSE', true, true, false)
on conflict (code) do nothing;

create index if not exists account_heads_society_id_idx on account_heads (society_id);
create index if not exists account_heads_active_idx on account_heads (is_active);
create index if not exists society_bank_accounts_account_head_id_idx on society_bank_accounts (account_head_id);
