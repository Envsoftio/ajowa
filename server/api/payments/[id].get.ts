import { createApiSuccess } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const id = readUuidParam(event)
  const isStaff = ['ADMIN', 'MANAGER'].includes(authMe.user.role)
  const result = await queryRows(
    `
      select
        p.*,
        p.payment_date::text as payment_date,
        f.flat_number,
        b.name as block_name,
        u.full_name as payer_name,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', pa.id,
              'dueId', pa.maintenance_due_id,
              'billingPeriodId', md.billing_period_id,
              'billingPeriodLabel', bp.label,
              'dueAmount', pa.due_amount,
              'lateFeeComponent', pa.late_fee_component,
              'allocatedAmount', pa.allocated_amount,
              'remainingBalance', pa.remaining_balance,
              'allocationOrder', pa.allocation_order
            )
            order by pa.allocation_order
          ) filter (where pa.id is not null),
          '[]'::jsonb
        ) as allocations
      from payments p
      left join flats f on f.id = p.received_for_flat_id
      left join blocks b on b.id = f.block_id
      left join users u on u.id = p.payer_user_id
      left join payment_allocations pa on pa.payment_id = p.id
      left join maintenance_dues md on md.id = pa.maintenance_due_id
      left join billing_periods bp on bp.id = md.billing_period_id
      where p.id = $1
        and p.society_id = $2
        and ($3::boolean = true or p.payer_user_id = $4)
      group by p.id, f.flat_number, b.name, u.full_name
      limit 1
    `,
    [id, authMe.user.societyId, isStaff, authMe.user.id],
  )
  const payment = result.rows[0]
  if (!payment) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Payment not found.' })
  }

  return createApiSuccess(event, payment)
})
