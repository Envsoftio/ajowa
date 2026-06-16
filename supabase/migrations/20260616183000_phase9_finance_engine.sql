alter table transaction_categories
  add column if not exists account_head_id uuid references account_heads(id) on delete restrict;

alter table financial_period_close
  add column if not exists opening_balance numeric(10,2) not null default 0,
  add column if not exists income_total numeric(10,2) not null default 0,
  add column if not exists expense_total numeric(10,2) not null default 0,
  add column if not exists closing_balance numeric(10,2) not null default 0,
  add column if not exists validation_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists reopen_reason text;

create index if not exists transaction_categories_account_head_id_idx on transaction_categories (account_head_id);
create index if not exists financial_period_close_date_range_idx on financial_period_close (society_id, start_date, end_date);

update transaction_categories tc
set account_head_id = ah.id
from account_heads ah
where tc.account_head_id is null
  and ah.code = case
    when tc.transaction_type = 'EXPENSE' then 'EXP-GENERAL'
    else 'INC-MAINT'
  end
  and (ah.society_id = tc.society_id or ah.society_id is null);

update transaction_categories tc
set account_head_id = ah.id
from account_heads ah
where tc.account_head_id is null
  and ah.head_type = tc.transaction_type::text::account_head_type
  and ah.allows_manual_entries = true
  and ah.is_active = true
  and (ah.society_id = tc.society_id or ah.society_id is null);
