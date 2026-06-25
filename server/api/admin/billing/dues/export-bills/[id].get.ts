import { z } from 'zod'
import { createApiSuccess, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getBillPdfExportJobForUser } from '~/server/utils/bill-pdf-export-jobs'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const params = validateInput(paramsSchema, {
    id: getRouterParam(event, 'id'),
  })
  const { summary } = await getBillPdfExportJobForUser({
    jobId: params.id,
    societyId: authMe.user.societyId,
    requestedByUserId: authMe.user.id,
  })

  return createApiSuccess(event, {
    job: summary,
    downloadUrl: summary.status === 'READY'
      ? `/api/admin/billing/dues/export-bills/${summary.id}/download`
      : null,
  })
})
