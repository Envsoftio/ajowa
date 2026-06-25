import process from 'node:process'
import { z } from 'zod'
import { processBillPdfExportJob } from '../../server/utils/bill-pdf-export-jobs'

const requestSchema = z.object({
  jobId: z.string().uuid(),
})

const readJson = async (request: Request) => {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

const getBillExportWorkerSecret = () =>
  process.env.BILL_EXPORT_WORKER_SECRET ?? process.env.BETTER_AUTH_SECRET ?? ''

export default async (request: Request) => {
  const configuredSecret = getBillExportWorkerSecret()

  if (
    configuredSecret &&
    request.headers.get('x-bill-export-secret') !== configuredSecret
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const parsed = requestSchema.safeParse(await readJson(request))

  if (!parsed.success) {
    return Response.json({ message: 'A valid jobId is required.' }, { status: 400 })
  }

  await processBillPdfExportJob(parsed.data.jobId)

  return new Response(null, { status: 204 })
}

export const config = {
  background: true,
  path: '/api/background/billing-dues-export',
}
