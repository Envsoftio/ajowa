alter table maintenance_dues
  add column if not exists manual_late_fee_starts_on date,
  add column if not exists late_fee_waived_amount numeric(10,2) not null default 0;

alter table maintenance_dues
  drop constraint if exists maintenance_dues_late_fee_waived_amount_check;

alter table maintenance_dues
  add constraint maintenance_dues_late_fee_waived_amount_check
  check (
    late_fee_waived_amount >= 0
    and late_fee_waived_amount <= waived_amount
  );

comment on column maintenance_dues.manual_late_fee_starts_on is
  'Staff-approved due-specific late-fee start override. The latest applicable start date wins.';

comment on column maintenance_dues.late_fee_waived_amount is
  'Component of waived_amount attributable specifically to an audited late-fee correction.';
