import { createApiSuccess } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { getSafeOnlinePaymentStatus } from '~/server/utils/online-payments'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const paymentId = readUuidParam(event)
  const status = await getSafeOnlinePaymentStatus(paymentId)
  if (
    !status ||
    status.society_id !== authMe.user.societyId ||
    status.payer_user_id !== authMe.user.id
  ) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Online payment not found.',
    })
  }

  return createApiSuccess(event, {
    paymentId: status.payment_id,
    status: status.status,
    attemptStatus: status.attempt_status,
    amount: Number(status.amount),
    receiptNumber: status.receipt_number,
    reference: status.merchant_transaction_id,
    retryAllowed: status.retry_allowed,
    failureCode: status.failure_code,
  })
})
