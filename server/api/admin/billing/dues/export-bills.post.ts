import process from 'node:process'
import { getRequestURL, type H3Event } from 'h3'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { billPdfExportRequestSchema } from '~/server/utils/bill-pdf-export'
import {
  createBillPdfExportJob,
  processBillPdfExportJob,
} from '~/server/utils/bill-pdf-export-jobs'
import { AppError } from '~/server/utils/errors'

const getWorkerEndpoint = (event: H3Event) => {
  const url = getRequestURL(event)
  return `${url.origin}/api/background/billing-dues-export`
}

const getBillExportWorkerSecret = () =>
  process.env.BILL_EXPORT_WORKER_SECRET ?? process.env.BETTER_AUTH_SECRET ?? ''

const invokeBillExportWorker = async (event: H3Event, jobId: string) => {
  const headers: HeadersInit = {
    'content-type': 'application/json',
  }
  const workerSecret = getBillExportWorkerSecret()

  if (workerSecret) {
    headers['x-bill-export-secret'] = workerSecret
  }

  try {
    const response = await fetch(getWorkerEndpoint(event), {
      method: 'POST',
      headers,
      body: JSON.stringify({ jobId }),
    })

    if (response.ok || response.status === 202) {
      return
    }

    if (process.env.NETLIFY === 'true') {
      throw new Error(`Worker responded with HTTP ${response.status}.`)
    }
  } catch (error) {
    if (process.env.NETLIFY === 'true') {
      throw error
    }
  }

  void processBillPdfExportJob(jobId).catch((error) => {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Local bill export worker failed.',
      jobId,
      cause: error instanceof Error ? error.message : String(error),
    }))
  })
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validateInput(billPdfExportRequestSchema, await readJsonBody(event))
  const job = await createBillPdfExportJob({
    societyId: authMe.user.societyId,
    requestedByUserId: authMe.user.id,
    request: body,
  })

  try {
    await invokeBillExportWorker(event, job.id)
  } catch (error) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 502,
      message: 'Could not start the bill export worker.',
      details: {
        cause: error instanceof Error ? error.message : String(error),
      },
    })
  }

  return createApiSuccess(event, { job })
})
