-- DG late fees are opt-in. Repair legacy DG dues that were recalculated with
-- the society-wide CAM/general late-fee policy while DG late fees were off.
update public.maintenance_dues md
set
  late_fee_amount = 0,
  total_amount = greatest(md.base_amount - md.waived_amount, 0),
  balance_amount = greatest(
    md.base_amount - md.waived_amount - md.paid_amount,
    0
  ),
  status = case
    when md.status in ('WAIVED', 'CANCELLED') then md.status
    when greatest(
      md.base_amount - md.waived_amount - md.paid_amount,
      0
    ) <= 0 then 'PAID'::public.due_status
    when md.paid_amount > 0 then 'PARTIALLY_PAID'::public.due_status
    else 'OPEN'::public.due_status
  end,
  updated_at = now()
from public.billing_periods bp, public.society_profile sp
where bp.id = md.billing_period_id
  and sp.id = md.society_id
  and bp.charge_type = 'DG_SET'
  and coalesce(sp.settings->'dgLateFeeEnabled', 'false'::jsonb) <> 'true'::jsonb
  and md.late_fee_amount > 0;
