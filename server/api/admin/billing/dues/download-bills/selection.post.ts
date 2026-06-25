import { readJsonBody, validateInput, createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { AppError } from '~/server/utils/errors'
import {
  billPdfExportRequestSchema,
  getBillPdfExportSelection,
  maxBillPdfExportDueIds,
} from '~/server/utils/bill-pdf-export'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validateInput(billPdfExportRequestSchema, await readJsonBody(event))
  const selection = await getBillPdfExportSelection(authMe.user.societyId, body, {
    maxTotal: maxBillPdfExportDueIds,
    overMaxMessage: (total, maxTotal) =>
      `This download matches ${total} bill PDFs. Please narrow the selection to ${maxTotal} or fewer bills.`,
  })

  if (selection.total === 0) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'No bill PDFs matched this download request.',
    })
  }

  return createApiSuccess(event, {
    ids: selection.ids,
    total: selection.total,
  })
})
