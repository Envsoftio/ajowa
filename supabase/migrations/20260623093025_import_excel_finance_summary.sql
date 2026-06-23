create or replace function validate_posted_journal_entry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_entry_id uuid;
  v_status finance_lifecycle_status;
  v_debit numeric(12,2);
  v_credit numeric(12,2);
  v_line_count integer;
begin
  if tg_table_name = 'journal_lines' then
    v_entry_id = coalesce(new.journal_entry_id, old.journal_entry_id);
  else
    v_entry_id = coalesce(new.id, old.id);
  end if;

  if v_entry_id is null then
    return coalesce(new, old);
  end if;

  select status into v_status
  from journal_entries
  where id = v_entry_id;

  if v_status is distinct from 'POSTED' then
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

alter table transactions
  drop constraint if exists transactions_amount_check,
  add constraint transactions_amount_check check (amount >= 0);

alter table journal_lines
  drop constraint if exists journal_lines_amount_check,
  add constraint journal_lines_amount_check check (amount >= 0);

with seed_account_heads as (
  select *
  from (
    values
      ('EXP-GENERAL', 'General Expense', 'EXPENSE', 'SYS-EXPENSE'),
      ('INC-MAINT', 'Maintenance Income', 'INCOME', 'SYS-INCOME'),
      ('INC-LATE-FEE', 'Late Fee Income', 'INCOME', 'SYS-INCOME')
  ) as seed(code, name, head_type, parent_code)
)
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
  seed.code,
  seed.name,
  seed.head_type::account_head_type,
  true,
  true,
  true
from seed_account_heads seed
join account_heads parent on parent.code = seed.parent_code
on conflict (code) do update
set
  parent_id = excluded.parent_id,
  name = excluded.name,
  head_type = excluded.head_type,
  is_system = true,
  is_active = true,
  allows_manual_entries = true;

with seed_categories as (
  select *
  from (
    values
      ('EXP-UTL-001', 'Diesel Expenses - DG Set', 'EXPENSE', 'Utilities', 'EXP-GENERAL', true),
      ('EXP-UTL-002', 'Electricity Expenses - PSPCL', 'EXPENSE', 'Utilities', 'EXP-GENERAL', true),
      ('EXP-STF-001', 'Housekeeping Expenses (UMP Security & Facility Pvt. Ltd.)', 'EXPENSE', 'Staff & Services', 'EXP-GENERAL', true),
      ('EXP-AMC-001', 'JLPL Bill (CAM, Water Ch., Sewarage Cess.)', 'EXPENSE', 'Maintenance & AMC', 'EXP-GENERAL', true),
      ('EXP-AMC-002', 'Maintenance Expenses', 'EXPENSE', 'Maintenance & AMC', 'EXP-GENERAL', true),
      ('EXP-ADM-003', 'Imprest Advance', 'EXPENSE', 'Admin & Office', 'EXP-GENERAL', true),
      ('EXP-ADM-001', 'Office Expenses', 'EXPENSE', 'Admin & Office', 'EXP-GENERAL', true),
      ('EXP-ADM-005', 'Club House Security / FFSLLP Refund', 'EXPENSE', 'Admin & Office', 'EXP-GENERAL', true),
      ('EXP-STF-005', 'Park Plus Expenses', 'EXPENSE', 'Staff & Services', 'EXP-GENERAL', true),
      ('EXP-STF-004', 'MyGate Services Expenses', 'EXPENSE', 'Staff & Services', 'EXP-GENERAL', true),
      ('EXP-STF-002', 'Security Expenses', 'EXPENSE', 'Staff & Services', 'EXP-GENERAL', true),
      ('EXP-STF-003', 'Salary Expenses', 'EXPENSE', 'Staff & Services', 'EXP-GENERAL', true),
      ('EXP-PRO-001', 'CA Service Charges', 'EXPENSE', 'Professional', 'EXP-GENERAL', true),
      ('EXP-PRO-002', 'Legal Services Expenses', 'EXPENSE', 'Professional', 'EXP-GENERAL', true),
      ('EXP-AMC-003', 'AMC Schindler Elevators', 'EXPENSE', 'Maintenance & AMC', 'EXP-GENERAL', true),
      ('EXP-AMC-004', 'AMC Kone Elevators', 'EXPENSE', 'Maintenance & AMC', 'EXP-GENERAL', true),
      ('EXP-ADM-002', 'Bank Charges', 'EXPENSE', 'Admin & Office', 'EXP-GENERAL', true),
      ('EXP-EVT-001', 'Festival Expenses', 'EXPENSE', 'Events', 'EXP-GENERAL', true),
      ('INC-MNT-001', 'CAM Charges', 'INCOME', 'Maintenance', 'INC-MAINT', false),
      ('INC-MNT-002', 'DG Set Backup Charges', 'INCOME', 'Maintenance', 'INC-MAINT', false),
      ('INC-MNT-003', 'DG Set Automatic Changeover', 'INCOME', 'Maintenance', 'INC-MAINT', false),
      ('INC-FAC-001', 'Club House Charges', 'INCOME', 'Facility', 'INC-MAINT', false),
      ('INC-MOV-001', 'Move In-Out / Facilitation Charges', 'INCOME', 'Move & Restoration', 'INC-MAINT', false),
      ('INC-MSC-001', 'Scrap', 'INCOME', 'Miscellaneous', 'INC-MAINT', false),
      ('INC-MOV-002', 'Restoration Charges', 'INCOME', 'Move & Restoration', 'INC-MAINT', false),
      ('INC-FAC-005', 'RFID Tags', 'INCOME', 'Facility', 'INC-MAINT', false),
      ('INC-FAC-002', 'Restaurant Rent', 'INCOME', 'Facility', 'INC-MAINT', false),
      ('INC-FAC-006', 'Restaurant Electricity Bill', 'INCOME', 'Facility', 'INC-MAINT', false),
      ('INC-FAC-003', 'Vegetable Shop Rent', 'INCOME', 'Facility', 'INC-MAINT', false),
      ('INC-FAC-007', 'Vegetable Shop Electricity Bill', 'INCOME', 'Facility', 'INC-MAINT', false),
      ('INC-FAC-008', 'Iron Press Vendor Elect Bill', 'INCOME', 'Facility', 'INC-MAINT', false),
      ('INC-ADM-001', 'Bank Charges', 'INCOME', 'Admin & Office', 'INC-MAINT', false),
      ('INC-MSC-002', 'Festival Contribution', 'INCOME', 'Miscellaneous', 'INC-MAINT', false),
      ('INC-MSC-003', 'Penalty Violation - Society Guidelines', 'INCOME', 'Miscellaneous', 'INC-LATE-FEE', false),
      ('INC-SUS-001', 'Suspense', 'INCOME', 'Suspense', 'INC-MAINT', false),
      ('INC-MSC-004', 'Recovery from Builder - Shed Inst.', 'INCOME', 'Miscellaneous', 'INC-MAINT', false),
      ('INC-ADM-002', 'Imprest Advance F.Y. 2025-26 Closure', 'INCOME', 'Admin & Office', 'INC-MAINT', false),
      ('INC-FAC-004', 'Parking Commission', 'INCOME', 'Facility', 'INC-MAINT', false)
  ) as seed(code, name, transaction_type, category_group, account_head_code, requires_attachment)
)
insert into transaction_categories (
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
  seed.code,
  seed.name,
  seed.transaction_type::transaction_type,
  seed.category_group,
  account_heads.id,
  seed.requires_attachment,
  true,
  true
from seed_categories seed
join account_heads on account_heads.code = seed.account_head_code
on conflict (code) do update
set
  name = excluded.name,
  transaction_type = excluded.transaction_type,
  category_group = excluded.category_group,
  account_head_id = excluded.account_head_id,
  requires_attachment = excluded.requires_attachment,
  is_system = true,
  is_active = true,
  updated_at = now();

do $$
declare
  v_society_id uuid;
  v_admin_user_id uuid;
  v_bank_account_head_id uuid;
  v_row record;
  v_category_id uuid;
  v_category_account_head_id uuid;
  v_transaction_id uuid;
  v_journal_entry_id uuid;
  v_journal_voucher text;
  v_voucher_number text;
  v_description text;
  v_source_doc constant text := 'expenses.xlsx and income.xlsx';
begin
  select id
  into v_society_id
  from society_profile
  where code = 'AJOWA'
  limit 1;

  if v_society_id is null then
    insert into society_profile (
      code,
      name,
      registration_number,
      address_line_1,
      city,
      state,
      pincode,
      contact_email,
      contact_phone,
      timezone,
      settings
    )
    values (
      'AJOWA',
      'AJOWA Society',
      'AJOWA-REG-001',
      'AJOWA Main Office',
      'Mohali',
      'Punjab',
      '160055',
      'acmejubilee.rwa@gmail.com',
      '+919999999999',
      'Asia/Kolkata',
      jsonb_build_object(
        'signup', jsonb_build_object('controlled', true),
        'tenantPaymentPerFlat', true,
        'familyAccess', true,
        'advanceCredit', true,
        'financeApprovalRequired', true,
        'attachmentsRequired', true,
        'highValueConfirmation', true,
        'ticketClosureRequiresReview', true,
        'managerBroadcastScope', 'CONFIGURABLE',
        'billingTenure', 'MONTHLY',
        'excessPaymentHandling', 'KEEP_AS_ADVANCE',
        'graceDays', 0,
        'lateFeePerDay', 50
      )
    )
    on conflict (code) do update
      set name = excluded.name,
          registration_number = excluded.registration_number,
          address_line_1 = excluded.address_line_1,
          city = excluded.city,
          state = excluded.state,
          pincode = excluded.pincode,
          contact_email = excluded.contact_email,
          contact_phone = excluded.contact_phone,
          timezone = excluded.timezone,
          settings = excluded.settings,
          updated_at = now()
    returning id into v_society_id;
  end if;

  select id
  into v_admin_user_id
  from users
  where society_id = v_society_id
    and role = 'ADMIN'
    and is_active = true
  order by created_at asc
  limit 1;

  select id
  into v_bank_account_head_id
  from account_heads
  where code = 'ASSET-BANK'
  limit 1;

  if v_bank_account_head_id is null then
    raise exception 'Missing ASSET-BANK account head for finance summary import';
  end if;

  create temporary table ajowa_finance_summary_months (
    source_section text not null,
    month_index integer not null,
    month_key text not null,
    month_label text not null,
    transaction_date date not null
  ) on commit drop;

  insert into ajowa_finance_summary_months (
    source_section,
    month_index,
    month_key,
    month_label,
    transaction_date
  )
  values
    ('EXPENSES', 1, '202505', 'Apr-May 2025', '2025-05-31'),
    ('EXPENSES', 2, '202506', 'June 2025', '2025-06-30'),
    ('EXPENSES', 3, '202507', 'July 2025', '2025-07-31'),
    ('EXPENSES', 4, '202508', 'August 2025', '2025-08-31'),
    ('EXPENSES', 5, '202509', 'September 2025', '2025-09-30'),
    ('EXPENSES', 6, '202510', 'October 2025', '2025-10-31'),
    ('EXPENSES', 7, '202511', 'November 2025', '2025-11-30'),
    ('EXPENSES', 8, '202512', 'December 2025', '2025-12-31'),
    ('EXPENSES', 9, '202601', 'January 2026', '2026-01-31'),
    ('EXPENSES', 10, '202602', 'February 2026', '2026-02-28'),
    ('EXPENSES', 11, '202603', 'March 2026', '2026-03-31'),
    ('EXPENSES', 12, '202604', 'April 2026', '2026-04-30'),
    ('EXPENSES', 13, '202605', 'May 2026', '2026-05-31'),
    ('COLLECTION', 1, '202505', 'Apr-May 2025', '2025-05-31'),
    ('COLLECTION', 2, '202506', 'June 2025', '2025-06-30'),
    ('COLLECTION', 3, '202507', 'July 2025', '2025-07-31'),
    ('COLLECTION', 4, '202508', 'August 2025', '2025-08-31'),
    ('COLLECTION', 5, '202509', 'September 2025', '2025-09-30'),
    ('COLLECTION', 6, '202510', 'October 2025', '2025-10-31'),
    ('COLLECTION', 7, '202511', 'November 2025', '2025-11-30'),
    ('COLLECTION', 8, '202512', 'December 2025', '2025-12-31'),
    ('COLLECTION', 9, '202601', 'January 2026', '2026-01-31'),
    ('COLLECTION', 10, '202602', 'February 2026', '2026-02-28'),
    ('COLLECTION', 11, '202603', 'March 2026', '2026-03-31'),
    ('COLLECTION', 12, '202604', 'April 2026', '2026-04-30');

  create temporary table ajowa_finance_summary_rows (
    source_section text not null,
    transaction_type transaction_type not null,
    category_code text not null,
    category_name text not null,
    source_header text not null,
    amounts numeric[] not null,
    expected_total numeric not null
  ) on commit drop;

  insert into ajowa_finance_summary_rows (
    source_section,
    transaction_type,
    category_code,
    category_name,
    source_header,
    amounts,
    expected_total
  )
  values
    ('EXPENSES', 'EXPENSE', 'EXP-UTL-001', 'Diesel Expenses - DG Set', 'DIESEL EXPENSES-DG SET', array[0,225140,264870,176580,132435,176580,0,0,88290,158922,88290,88290,0]::numeric[], 1399397),
    ('EXPENSES', 'EXPENSE', 'EXP-UTL-002', 'Electricity Expenses - PSPCL', 'ELECTRICITY EXPENSES-PSPCL', array[0,346207,267060,367160,226940,334390,203360,0,0,244160,736120,14720,0]::numeric[], 2740117),
    ('EXPENSES', 'EXPENSE', 'EXP-STF-001', 'Housekeeping Expenses (UMP Security & Facility Pvt. Ltd.)', 'HOUSEKEEPING EXPENSES (UMP SECURITY & FACILITY PVT. LTD.)', array[0,335755,396393,429651,396957,372891,326678,384760,398796,376715,314033,312462,0]::numeric[], 4045091),
    ('EXPENSES', 'EXPENSE', 'EXP-AMC-001', 'JLPL Bill (CAM, Water Ch., Sewarage Cess.)', 'JLPL BILL (CAM, WATER CH., SEWARAGE CESS.)', array[0,169560,171179,179911,167880,167748,163098,145313,145889,184877,183357,138996,0]::numeric[], 1817808),
    ('EXPENSES', 'EXPENSE', 'EXP-AMC-002', 'Maintenance Expenses', 'MAINTENANCE EXPENSES', array[0,152169,37366,110103,338322,15169,282283,252116,136887,90803,55460,296960,59570]::numeric[], 1827208),
    ('EXPENSES', 'EXPENSE', 'EXP-ADM-003', 'Imprest Advance', 'IMPREST ADVANCE', array[0,0,50000,25000,25000,50000,25000,25000,25000,0,33723,28245,0]::numeric[], 286968),
    ('EXPENSES', 'EXPENSE', 'EXP-ADM-001', 'Office Expenses', 'OFFICE EXPENSES', array[0,62209,7677,37445,33412,27801,14493,16160,13790,17106,10812,13020,15920]::numeric[], 269845),
    ('EXPENSES', 'EXPENSE', 'EXP-ADM-005', 'Club House Security / FFSLLP Refund', 'CLUB HOUSE SECURITY / FFSLLP REFUND', array[0,0,0,31924,0,0,5000,0,0,0,0,0,0]::numeric[], 36924),
    ('EXPENSES', 'EXPENSE', 'EXP-STF-005', 'Park Plus Expenses', 'PARK PLUS EXPENSES', array[0,230000,113144,11800,0,11800,8850,7080,0,7080,0,14160,0]::numeric[], 403914),
    ('EXPENSES', 'EXPENSE', 'EXP-STF-004', 'MyGate Services Expenses', 'MYGATE SERVICES EXPENSES', array[0,0,0,0,0,0,64968,0,0,0,0,212400,0]::numeric[], 277368),
    ('EXPENSES', 'EXPENSE', 'EXP-STF-002', 'Security Expenses', 'SECURITY EXPENSES', array[0,614131,487085,608982,612031,609257,603029,590633,569875,584590,577826,593958,0]::numeric[], 6451397),
    ('EXPENSES', 'EXPENSE', 'EXP-STF-003', 'Salary Expenses', 'SALARY EXPENSES', array[0,235268,296324,332596,337095,346992,330651,308468,313322,304947,315951,288458,0]::numeric[], 3410072),
    ('EXPENSES', 'EXPENSE', 'EXP-PRO-001', 'CA Service Charges', 'CA SERVICE CHARGES', array[0,0,0,0,0,0,0,0,35000,0,0,0,0]::numeric[], 35000),
    ('EXPENSES', 'EXPENSE', 'EXP-PRO-002', 'Legal Services Expenses', 'LEGAL SERVICES EXPENSES', array[0,0,0,10000,0,0,10000,0,55000,12500,0,15000,0]::numeric[], 102500),
    ('EXPENSES', 'EXPENSE', 'EXP-AMC-003', 'AMC Schindler Elevators', 'AMC SCHINDLER ELEVATORS', array[0,0,93928,0,46964,0,46964,0,0,0,0,469640,0]::numeric[], 657496),
    ('EXPENSES', 'EXPENSE', 'EXP-AMC-004', 'AMC Kone Elevators', 'AMC KONE ELEVATORS', array[0,0,0,0,0,0,0,580464,0,0,0,609489,0]::numeric[], 1189953),
    ('EXPENSES', 'EXPENSE', 'EXP-ADM-002', 'Bank Charges', 'BANK CHARGES', array[0,0,13,13,10,134,9,132,17,14,12,8,17]::numeric[], 379),
    ('EXPENSES', 'EXPENSE', 'EXP-EVT-001', 'Festival Expenses', 'FESTIVAL EXPENSES', array[0,0,0,0,0,0,0,0,16700,0,39150,0,0]::numeric[], 55850),
    ('COLLECTION', 'INCOME', 'INC-MNT-001', 'CAM Charges', 'CAM CHARGES', array[57038,3205765,1530313,1871213,772185,4060494,986438,1040315,4574700,893795,862301,4932283]::numeric[], 24786840),
    ('COLLECTION', 'INCOME', 'INC-MNT-002', 'DG Set Backup Charges', 'DG SET BACKUP CHARGES', array[0,11783,6102,162597,372505,27747,60440,18327,125108,148872,73528,45958]::numeric[], 1052967),
    ('COLLECTION', 'INCOME', 'INC-MNT-003', 'DG Set Automatic Changeover', 'DG SET AUTOMATIC CHANGEOVER', array[0,0,0,20000,8000,0,0,0,0,4500,4500,4501]::numeric[], 41501),
    ('COLLECTION', 'INCOME', 'INC-FAC-001', 'Club House Charges', 'CLUB HOUSE CHARGES', array[3000,11200,26100,54600,31500,29595,38200,29100,15300,8300,12400,33752]::numeric[], 293047),
    ('COLLECTION', 'INCOME', 'INC-MOV-001', 'Move In-Out / Facilitation Charges', 'MOVE IN-OUT/ FACILITATION CHARGES', array[0,57000,53000,50000,58000,29000,28000,46500,29000,33000,48000,52000]::numeric[], 483500),
    ('COLLECTION', 'INCOME', 'INC-MSC-001', 'Scrap', 'SCRAP', array[0,2342,2700,0,0,0,0,0,0,800,0,3510]::numeric[], 9352),
    ('COLLECTION', 'INCOME', 'INC-MOV-002', 'Restoration Charges', 'RESTORATION CHARGES', array[0,0,15000,5000,10000,5000,10000,10000,0,0,0,0]::numeric[], 55000),
    ('COLLECTION', 'INCOME', 'INC-FAC-005', 'RFID Tags', 'RFID TAGS', array[2,0,38622,19526,14601,13601,14250,6600,3800,2600,6100,3001]::numeric[], 122703),
    ('COLLECTION', 'INCOME', 'INC-FAC-002', 'Restaurant Rent', 'RESTAURANT RENT', array[0,0,0,0,0,0,30000,0,10000,10000,10000,10000]::numeric[], 70000),
    ('COLLECTION', 'INCOME', 'INC-FAC-006', 'Restaurant Electricity Bill', 'RESTAURANT ELECTRICITY BILL', array[0,0,0,0,0,0,0,0,0,4392,3888,3516]::numeric[], 11796),
    ('COLLECTION', 'INCOME', 'INC-FAC-003', 'Vegetable Shop Rent', 'VEGETABLE SHOP RENT', array[0,0,0,5000,7500,7500,7500,7500,7400,7600,7500,7500]::numeric[], 65000),
    ('COLLECTION', 'INCOME', 'INC-FAC-007', 'Vegetable Shop Electricity Bill', 'VEGETABLE SHOP ELECTRICITY BILL', array[0,0,0,0,0,0,6000,6264,0,0,2960,2630]::numeric[], 17854),
    ('COLLECTION', 'INCOME', 'INC-FAC-008', 'Iron Press Vendor Elect Bill', 'IRON PRESS VENDOR ELECT BILL', array[0,0,0,0,0,0,7000,0,3360,1548,888,996]::numeric[], 13792),
    ('COLLECTION', 'INCOME', 'INC-ADM-001', 'Bank Charges', 'BANK CHARGES', array[0,0,0,0,0,0,500,500,0,0,0,0]::numeric[], 1000),
    ('COLLECTION', 'INCOME', 'INC-MSC-002', 'Festival Contribution', 'FESTIVAL CONTRIBUTION', array[0,0,0,0,0,0,0,0,28800,35000,10500,0]::numeric[], 74300),
    ('COLLECTION', 'INCOME', 'INC-MSC-003', 'Penalty Violation - Society Guidelines', 'PENALTY VIOLATION-SOCIETY GUIDELINES', array[0,0,0,0,0,0,0,0,0,2000,2500,2500]::numeric[], 7000),
    ('COLLECTION', 'INCOME', 'INC-SUS-001', 'Suspense', 'SUSPENSE', array[0,0,0,0,0,0,0,0,0,1000,1102,59]::numeric[], 2161),
    ('COLLECTION', 'INCOME', 'INC-MSC-004', 'Recovery from Builder - Shed Inst.', 'RECOVERY FROM BUILDER-SHED INST.', array[0,0,0,0,0,0,0,0,0,0,30000,0]::numeric[], 30000),
    ('COLLECTION', 'INCOME', 'INC-ADM-002', 'Imprest Advance F.Y. 2025-26 Closure', 'IMPREST ADVANCE F.Y. 2025-26 CLOSURE', array[0,0,0,0,0,0,0,0,0,0,16277,0]::numeric[], 16277),
    ('COLLECTION', 'INCOME', 'INC-FAC-004', 'Parking Commission', 'PARKING COMMISSION', array[0,0,0,0,0,0,0,0,0,0,98000,0]::numeric[], 98000);

  if exists (
    select 1
    from ajowa_finance_summary_rows row_data
    cross join lateral (
      select coalesce(sum(amount), 0) as calculated_total
      from unnest(row_data.amounts) as amount_values(amount)
    ) totals
    where totals.calculated_total <> row_data.expected_total
  ) then
    raise exception 'AJOWA finance summary import row totals do not match source document totals';
  end if;

  if (
    select coalesce(sum(amount), 0)
    from ajowa_finance_summary_rows row_data
    cross join lateral unnest(row_data.amounts) as amount_values(amount)
    where row_data.transaction_type = 'EXPENSE'
  ) <> 25007287 then
    raise exception 'AJOWA expense summary import total does not match source document total';
  end if;

  if (
    select coalesce(sum(amount), 0)
    from ajowa_finance_summary_rows row_data
    cross join lateral unnest(row_data.amounts) as amount_values(amount)
    where row_data.transaction_type = 'INCOME'
  ) <> 27252090 then
    raise exception 'AJOWA collection summary import total does not match source document total';
  end if;

  for v_row in
    select
      row_data.source_section,
      row_data.transaction_type::text as transaction_type,
      row_data.category_code,
      row_data.category_name,
      row_data.source_header,
      month_data.month_key,
      month_data.month_label,
      month_data.transaction_date,
      monthly_amount.amount::numeric(10,2) as amount
    from ajowa_finance_summary_rows row_data
    cross join lateral unnest(row_data.amounts) with ordinality as monthly_amount(amount, month_index)
    join ajowa_finance_summary_months month_data
      on month_data.source_section = row_data.source_section
     and month_data.month_index = monthly_amount.month_index
    order by month_data.transaction_date, row_data.transaction_type, row_data.category_code
  loop
    select tc.id, tc.account_head_id
    into v_category_id, v_category_account_head_id
    from transaction_categories tc
    where tc.code = v_row.category_code
      and tc.transaction_type::text = v_row.transaction_type
    limit 1;

    if v_category_id is null or v_category_account_head_id is null then
      raise exception 'Missing finance category or account head for %', v_row.category_code;
    end if;

    v_voucher_number := concat(
      'AJOWA-SUM-',
      case when v_row.transaction_type = 'EXPENSE' then 'EXP' else 'INC' end,
      '-',
      v_row.month_key,
      '-',
      v_row.category_code
    );
    v_description := format(
      'Imported from %s; section: Summary of %s; column: %s; source row header: %s.',
      v_source_doc,
      case when v_row.source_section = 'EXPENSES' then 'Expenses' else 'Collection' end,
      v_row.month_label,
      v_row.source_header
    );

    select id
    into v_transaction_id
    from transactions
    where society_id = v_society_id
      and voucher_number = v_voucher_number
    limit 1;

    if v_transaction_id is null then
      insert into transactions (
        society_id,
        transaction_type,
        category_id,
        title,
        description,
        counterparty_name,
        voucher_number,
        transaction_date,
        amount,
        status,
        created_by_user_id,
        approved_by_user_id,
        approved_at,
        posted_at
      )
      values (
        v_society_id,
        v_row.transaction_type::transaction_type,
        v_category_id,
        concat(v_row.category_name, ' - ', v_row.month_label),
        v_description,
        case when v_row.transaction_type = 'EXPENSE' then v_row.category_name else 'Imported collection summary' end,
        v_voucher_number,
        v_row.transaction_date,
        v_row.amount,
        'POSTED',
        v_admin_user_id,
        v_admin_user_id,
        now(),
        now()
      )
      returning id into v_transaction_id;
    end if;

    select id
    into v_journal_entry_id
    from journal_entries
    where transaction_id = v_transaction_id
    limit 1;

    if v_journal_entry_id is null then
      v_journal_voucher := concat(
        'JV-IMPORT-',
        case when v_row.transaction_type = 'EXPENSE' then 'EXP' else 'INC' end,
        '-',
        v_row.month_key,
        '-',
        v_row.category_code
      );

      insert into journal_entries (
        society_id,
        voucher_number,
        transaction_id,
        entry_date,
        description,
        status,
        posted_by_user_id,
        posted_at
      )
      values (
        v_society_id,
        v_journal_voucher,
        v_transaction_id,
        v_row.transaction_date,
        v_description,
        'DRAFT',
        v_admin_user_id,
        now()
      )
      returning id into v_journal_entry_id;

      insert into journal_lines (
        journal_entry_id,
        line_no,
        account_head_id,
        line_type,
        amount,
        description
      )
      values
        (
          v_journal_entry_id,
          1,
          case when v_row.transaction_type = 'EXPENSE' then v_category_account_head_id else v_bank_account_head_id end,
          'DEBIT',
          v_row.amount,
          v_description
        ),
        (
          v_journal_entry_id,
          2,
          case when v_row.transaction_type = 'EXPENSE' then v_bank_account_head_id else v_category_account_head_id end,
          'CREDIT',
          v_row.amount,
          v_description
        );

      update journal_entries
      set status = 'POSTED',
          posted_at = now(),
          posted_by_user_id = v_admin_user_id
      where id = v_journal_entry_id;
    end if;

    v_category_id := null;
    v_category_account_head_id := null;
    v_transaction_id := null;
    v_journal_entry_id := null;
  end loop;
end;
$$;
