import { createApiSuccess } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { getSafeOnlinePaymentStatus, retrieveAndApplyOnlinePayment } from '~/server/utils/online-payments'

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'dues.manage')
  const paymentId = readUuidParam(event)
  const result = await queryRows<{ attemptId: string; status: string }>(
    `select a.id as "attemptId", p.status::text
     from payments p join payment_gateway_attempts a on a.payment_id = p.id
     where p.id = $1 and p.society_id = $2
       and a.authoritative_gateway_success_at is not null
     limit 1`,
    [paymentId, authMe.user.societyId],
  )
  const payment = result.rows[0]
  if (!payment) throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Confirmed gateway payment not found.' })
  if (payment.status !== 'VERIFIED') {
    await retrieveAndApplyOnlinePayment(payment.attemptId)
  }
  const current = await getSafeOnlinePaymentStatus(paymentId)
  if (current?.status !== 'VERIFIED') {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'Gateway payment is still under review. Check the latest processing error.',
    })
  }
  return createApiSuccess(event, { paymentId })
})
