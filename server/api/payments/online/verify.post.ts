import { z } from 'zod'
import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import { AppError } from '~/server/utils/errors'
import {
  findOnlinePaymentAttempt,
  getSafeOnlinePaymentStatus,
  retrieveAndApplyOnlinePayment,
} from '~/server/utils/online-payments'

const verifySchema = z.object({ paymentId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const input = validateInput(verifySchema, await readJsonBody(event))
  const attempt = await findOnlinePaymentAttempt({ paymentId: input.paymentId })
  if (!attempt || attempt.society_id !== authMe.user.societyId) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Online payment not found.',
    })
  }
  const status = await getSafeOnlinePaymentStatus(input.paymentId)
  if (status?.payer_user_id !== authMe.user.id) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Online payment not found.',
    })
  }

  await retrieveAndApplyOnlinePayment(attempt.id)
  return createApiSuccess(
    event,
    await getSafeOnlinePaymentStatus(input.paymentId),
  )
})
