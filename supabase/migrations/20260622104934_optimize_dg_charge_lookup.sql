create index if not exists maintenance_charges_active_period_charge_flat_idx
  on maintenance_charges (society_id, billing_period_id, charge_name, flat_id)
  where is_active = true;
