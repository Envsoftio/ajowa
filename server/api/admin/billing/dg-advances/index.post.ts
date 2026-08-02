import { z } from 'zod'
import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { isDedicatedDgAdvanceAllocation } from '~/server/utils/dg-advance'
import { AppError } from '~/server/utils/errors'
import { recordManualPayment } from '~/server/utils/manual-payment'
import {
  consumeDgAdvanceCreditsForFlat,
  manualPaymentSchema,
} from '~/server/utils/payments'

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'billing.manage')
  const input = validateInput(manualPaymentSchema, await readJsonBody(event))
  if (!isDedicatedDgAdvanceAllocation(input)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'DG Advance accepts only an advance-only receipt scoped to DG Set bills.',
    })
  }
  if (!input.account || !z.string().uuid().safeParse(input.account).success) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Select the active deposit account for this DG advance.',
    })
  }
  if (
    !input.idempotencyKey ||
    !z.string().uuid().safeParse(input.idempotencyKey).success
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'A valid idempotency key is required for this DG advance.',
    })
  }

  const result = await recordManualPayment(input, {
    userId: authMe.user.id,
    societyId: authMe.user.societyId,
  })
  const adjustment = await consumeDgAdvanceCreditsForFlat({
    societyId: authMe.user.societyId,
    flatId: input.flatId,
  })

  return createApiSuccess(event, {
    ...result,
    appliedToOutstandingAmount: adjustment.consumedAmount,
    appliedDueCount: adjustment.affectedAccessPairs.length,
  })
})
