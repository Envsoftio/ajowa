alter table maintenance_charges
  drop constraint if exists maintenance_charges_amount_check;

alter table maintenance_charges
  add constraint maintenance_charges_amount_check
  check (
    amount > 0
    or (
      amount = 0
      and billing_period_id is not null
      and charge_breakdown @> '[{"chargeType":"DG_SET"}]'::jsonb
    )
  );
