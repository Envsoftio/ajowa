import { createApiSuccess } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const result = await queryRows<{
    paymentId: string
    flatId: string
    flatNumber: string
    amount: string
    reference: string
    gatewayPaid: boolean
  }>(
    `select p.id as "paymentId", p.received_for_flat_id as "flatId",
       f.flat_number as "flatNumber", p.amount::text,
       a.merchant_transaction_id as reference,
       (a.authoritative_gateway_success_at is not null) as "gatewayPaid"
     from payments p
     join payment_gateway_attempts a on a.payment_id = p.id
     join flats f on f.id = p.received_for_flat_id
     where p.society_id = $1 and p.payer_user_id = $2
       and p.status <> 'VERIFIED'
       and (a.status in ('CREATED', 'INITIATING', 'INITIATED',
         'PENDING_VERIFICATION', 'GATEWAY_SUCCESS', 'MANUAL_REVIEW')
         or a.authoritative_gateway_success_at is not null)
     order by a.created_at desc`,
    [authMe.user.societyId, authMe.user.id],
  )
  return createApiSuccess(event, result.rows)
})
