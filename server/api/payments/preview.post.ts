import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { paymentPreviewSchema, previewPaymentAllocation, type PaymentPreviewInput } from '~/server/utils/payments'
import { requireActiveUser } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireActiveUser(event)
  const input = validateInput(paymentPreviewSchema, await readJsonBody(event)) as PaymentPreviewInput
  const preview = await previewPaymentAllocation(input)

  return createApiSuccess(event, preview)
})
