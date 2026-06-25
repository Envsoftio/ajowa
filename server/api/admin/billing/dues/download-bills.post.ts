import { z } from 'zod'
import { readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { AppError } from '~/server/utils/errors'
import { generateMaintenanceBillPdf } from '~/server/utils/billing'
import {
  billPdfExportRequestSchema,
  getBillPdfExportSelection,
  uniqueBillPdfZipEntryName,
} from '~/server/utils/bill-pdf-export'
import { getRequestLogger } from '~/server/utils/logging'
import { createZipBuffer } from '~/server/utils/zip'

const maxBillsPerZip = 50

const downloadBillsSchema = billPdfExportRequestSchema.extend({
  limit: z.coerce.number().int().min(1).max(maxBillsPerZip).optional(),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const logger = getRequestLogger(event)
  const body = validateInput(downloadBillsSchema, await readJsonBody(event))
  const selection = await getBillPdfExportSelection(authMe.user.societyId, body, {
    limit: body.limit,
    offset: body.offset,
    maxTotal: body.limit ? undefined : maxBillsPerZip,
    overMaxMessage: (total) =>
      `This download matches ${total} bill PDFs. Please use the export job download so the app can prepare one ZIP in the background.`,
  })

  if (selection.ids.length === 0) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'No bill PDFs matched this download request.',
    })
  }

  const usedNames = new Map<string, number>()
  const zipEntries = []

  for (const dueId of selection.ids) {
    try {
      const bill = await generateMaintenanceBillPdf(dueId, {
        societyId: authMe.user.societyId,
        isStaff: true,
      })

      zipEntries.push({
        name: uniqueBillPdfZipEntryName(bill.fileName, usedNames),
        data: bill.buffer,
      })
    } catch (error) {
      logger.error('Bill PDF generation failed during ZIP download.', {
        dueId,
        societyId: authMe.user.societyId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Could not generate one of the bill PDFs. Please try downloading that bill individually to identify the affected record.',
      })
    }
  }

  const zipBuffer = createZipBuffer(zipEntries)
  const fileName = `maintenance-bills-${new Date().toISOString().slice(0, 10)}.zip`

  return new Response(new Uint8Array(zipBuffer), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${fileName}"`,
      'x-bill-count': String(zipEntries.length),
      'x-total-bill-count': String(selection.total),
      'x-bill-offset': String(selection.offset),
      'x-bill-limit': String(selection.limit),
    },
  })
})
