import { createApiSuccess } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'billing.view')
  const result = await queryRows<{
    paymentId: string
    flatNumber: string
    payerName: string
    amount: string
    reference: string
    gatewayPaymentId: string | null
    gatewayPaidAt: string | null
    attemptStatus: string
    lastError: string | null
    lastAttemptAt: string | null
  }>(
    `select p.id as "paymentId", f.flat_number as "flatNumber",
       u.full_name as "payerName", p.amount::text,
       a.merchant_transaction_id as reference,
       a.gateway_payment_id as "gatewayPaymentId",
       a.authoritative_gateway_success_at::text as "gatewayPaidAt",
       a.status as "attemptStatus", a.last_error_message as "lastError",
       a.updated_at::text as "lastAttemptAt"
     from payments p
     join payment_gateway_attempts a on a.payment_id = p.id
     join flats f on f.id = p.received_for_flat_id
     join users u on u.id = p.payer_user_id
     where p.society_id = $1 and p.status <> 'VERIFIED'
       and a.authoritative_gateway_success_at is not null
     order by a.authoritative_gateway_success_at desc`,
    [authMe.user.societyId],
  )
  return createApiSuccess(event, result.rows)
})
