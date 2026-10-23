import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { recordManualPayment } from '~/server/utils/manual-payment'
import { manualPaymentSchema } from '~/server/utils/payments'
import { toApiError } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  try {
    const authMe = await requirePermission(event, 'billing.manage')
    const input = validateInput(manualPaymentSchema, await readJsonBody(event))
    const result = await recordManualPayment(input, {
      userId: authMe.user.id,
      societyId: authMe.user.societyId,
    })

    return createApiSuccess(event, result)
  } catch (error) {
    throw toApiError(error)
  }
})
