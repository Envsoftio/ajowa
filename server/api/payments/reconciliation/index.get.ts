import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getQuerySafe } from '~/server/utils/master-data'
import { searchPaymentByReference } from '~/server/utils/payments'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['ADMIN', 'MANAGER'])
  const reference = String(getQuerySafe(event).reference ?? '').trim()
  const result = reference ? await searchPaymentByReference(reference) : { rows: [] }

  return createApiSuccess(event, { reference, matches: result.rows, duplicate: result.rows.length > 0 })
})
