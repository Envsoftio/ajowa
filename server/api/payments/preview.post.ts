import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { paymentPreviewSchema, previewPaymentAllocation, type PaymentPreviewInput } from '~/server/utils/payments'
import { requireActiveUser } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const input = validateInput(paymentPreviewSchema, await readJsonBody(event)) as PaymentPreviewInput
  const isStaff = ['ADMIN', 'MANAGER'].includes(authMe.user.role)

  if (!isStaff) {
    const access = await queryRows<{ id: string }>(
      `
        select fr.id
        from flat_residents fr
        join flats f on f.id = fr.flat_id
        where fr.flat_id = $1
          and fr.user_id = $2
          and fr.is_active = true
          and f.society_id = $3
        limit 1
      `,
      [input.flatId, authMe.user.id, authMe.user.societyId],
    )

    if (!access.rows[0]) {
      throw new AppError({
        code: 'FORBIDDEN',
        statusCode: 403,
        message: 'You can preview payments only for flats linked to your active relationship.',
      })
    }
  }

  const preview = await previewPaymentAllocation(input)

  return createApiSuccess(event, preview)
})
