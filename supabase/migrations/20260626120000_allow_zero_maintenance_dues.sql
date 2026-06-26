alter table maintenance_dues
  drop constraint if exists maintenance_dues_base_amount_check,
  add constraint maintenance_dues_base_amount_check check (base_amount >= 0);

alter table maintenance_dues
  drop constraint if exists maintenance_dues_total_amount_check,
  add constraint maintenance_dues_total_amount_check check (total_amount >= 0);
