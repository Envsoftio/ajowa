import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'

const schema = z.object({
  reference: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(500),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const input = validateInput(schema, await readJsonBody(event))

  return createApiSuccess(event, {
    reference: input.reference,
    confirmedBy: authMe.user.id,
    reason: input.reason,
    useInPaymentCreate: { allowDuplicateUtr: true, overrideReason: input.reason },
  })
})
