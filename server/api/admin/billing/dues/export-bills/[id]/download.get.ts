import { z } from 'zod'
import { validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import {
  createBillPdfExportSignedUrl,
  getBillPdfExportJobForUser,
} from '~/server/utils/bill-pdf-export-jobs'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const params = validateInput(paramsSchema, {
    id: getRouterParam(event, 'id'),
  })
  const { row } = await getBillPdfExportJobForUser({
    jobId: params.id,
    societyId: authMe.user.societyId,
    requestedByUserId: authMe.user.id,
  })
  const signedUrl = await createBillPdfExportSignedUrl(row)

  return sendRedirect(event, signedUrl, 302)
})
