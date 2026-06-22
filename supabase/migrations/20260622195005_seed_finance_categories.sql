with seed_account_heads as (
  select *
  from (
    values
      ('ASSET-CASH', 'Cash in Hand', 'ASSET', 'SYS-ASSET'),
      ('ASSET-BANK', 'Bank Account', 'ASSET', 'SYS-ASSET'),
      ('INC-MAINT', 'Maintenance Income', 'INCOME', 'SYS-INCOME'),
      ('INC-LATE-FEE', 'Late Fee Income', 'INCOME', 'SYS-INCOME'),
      ('EXP-GENERAL', 'General Expense', 'EXPENSE', 'SYS-EXPENSE')
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
  allows_manual_entries = true;

with seed_categories as (
  select *
  from (
    values
      ('EXP-UTL-001', 'Diesel Expenses - DG Set', 'EXPENSE', 'Utilities', 'EXP-GENERAL', true),
      ('EXP-UTL-002', 'Electricity Expenses - PSPCL', 'EXPENSE', 'Utilities', 'EXP-GENERAL', true),
      ('EXP-UTL-003', 'Restaurant Electricity Bill', 'EXPENSE', 'Utilities', 'EXP-GENERAL', true),
      ('EXP-UTL-004', 'Vegetable Shop Electricity Bill', 'EXPENSE', 'Utilities', 'EXP-GENERAL', true),
      ('EXP-UTL-005', 'Iron Press Vendor Electricity Bill', 'EXPENSE', 'Utilities', 'EXP-GENERAL', true),
      ('EXP-STF-001', 'Housekeeping Expenses', 'EXPENSE', 'Staff & Services', 'EXP-GENERAL', true),
      ('EXP-STF-002', 'Security Expenses', 'EXPENSE', 'Staff & Services', 'EXP-GENERAL', true),
      ('EXP-STF-003', 'Salary Expenses', 'EXPENSE', 'Staff & Services', 'EXP-GENERAL', true),
      ('EXP-STF-004', 'MyGate Services Expenses', 'EXPENSE', 'Staff & Services', 'EXP-GENERAL', true),
      ('EXP-STF-005', 'Park Plus Expenses', 'EXPENSE', 'Staff & Services', 'EXP-GENERAL', true),
      ('EXP-AMC-001', 'JLPL Bill CAM Water Sewarage', 'EXPENSE', 'Maintenance & AMC', 'EXP-GENERAL', true),
      ('EXP-AMC-002', 'Maintenance Expenses', 'EXPENSE', 'Maintenance & AMC', 'EXP-GENERAL', true),
      ('EXP-AMC-003', 'AMC Schindler Elevators', 'EXPENSE', 'Maintenance & AMC', 'EXP-GENERAL', true),
      ('EXP-AMC-004', 'AMC Kone Elevators', 'EXPENSE', 'Maintenance & AMC', 'EXP-GENERAL', true),
      ('EXP-PRO-001', 'CA Service Charges', 'EXPENSE', 'Professional', 'EXP-GENERAL', true),
      ('EXP-PRO-002', 'Legal Services Expenses', 'EXPENSE', 'Professional', 'EXP-GENERAL', true),
      ('EXP-ADM-001', 'Office Expenses', 'EXPENSE', 'Admin & Office', 'EXP-GENERAL', true),
      ('EXP-ADM-002', 'Bank Charges', 'EXPENSE', 'Admin & Office', 'EXP-GENERAL', true),
      ('EXP-ADM-003', 'Imprest Advance', 'EXPENSE', 'Admin & Office', 'EXP-GENERAL', true),
      ('EXP-ADM-004', 'Imprest Advance FY Closure', 'EXPENSE', 'Admin & Office', 'EXP-GENERAL', true),
      ('EXP-ADM-005', 'Club House Security FFSLLP Refund', 'EXPENSE', 'Admin & Office', 'EXP-GENERAL', true),
      ('EXP-EVT-001', 'Festival Expenses', 'EXPENSE', 'Events', 'EXP-GENERAL', true),
      ('INC-MNT-001', 'CAM Charges', 'INCOME', 'Maintenance', 'INC-MAINT', false),
      ('INC-MNT-002', 'DG Set Backup Charges', 'INCOME', 'Maintenance', 'INC-MAINT', false),
      ('INC-MNT-003', 'DG Set Automatic Changeover', 'INCOME', 'Maintenance', 'INC-MAINT', false),
      ('INC-FAC-001', 'Club House Charges', 'INCOME', 'Facility', 'INC-MAINT', false),
      ('INC-FAC-002', 'Restaurant Rent', 'INCOME', 'Facility', 'INC-MAINT', false),
      ('INC-FAC-003', 'Vegetable Shop Rent', 'INCOME', 'Facility', 'INC-MAINT', false),
      ('INC-FAC-004', 'Parking Commission', 'INCOME', 'Facility', 'INC-MAINT', false),
      ('INC-FAC-005', 'RFID Tags', 'INCOME', 'Facility', 'INC-MAINT', false),
      ('INC-MOV-001', 'Move In-Out Facilitation Charges', 'INCOME', 'Move & Restoration', 'INC-MAINT', false),
      ('INC-MOV-002', 'Restoration Charges', 'INCOME', 'Move & Restoration', 'INC-MAINT', false),
      ('INC-MSC-001', 'Scrap', 'INCOME', 'Miscellaneous', 'INC-MAINT', false),
      ('INC-MSC-002', 'Festival Contribution', 'INCOME', 'Miscellaneous', 'INC-MAINT', false),
      ('INC-MSC-003', 'Penalty Violation Society Guidelines', 'INCOME', 'Miscellaneous', 'INC-LATE-FEE', false),
      ('INC-MSC-004', 'Recovery from Builder Shed Inst', 'INCOME', 'Miscellaneous', 'INC-MAINT', false),
      ('INC-SUS-001', 'Suspense', 'INCOME', 'Suspense', 'INC-MAINT', false)
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
  is_system = true;
