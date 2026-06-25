import { createHash } from 'node:crypto'
import process from 'node:process'
import type { QueryResultRow } from 'pg'
import { z } from 'zod'
import { generateMaintenanceBillPdf } from './billing'
import {
  maxBillPdfExportDueIds,
  resolveBillPdfExportDueIds,
  uniqueBillPdfZipEntryName,
  type BillPdfExportRequest,
} from './bill-pdf-export'
import { getDatabasePool } from './database'
import { AppError } from './errors'
import {
  createPrivateSignedUrl,
  createStorageObjectKey,
  deletePrivateFile,
  STORAGE_REPORT_EXPORT_MAX_FILE_SIZE_BYTES,
  STORAGE_TARGETS,
  uploadPrivateFile,
} from './storage'
import { createZipBuffer } from './zip'

export type BillPdfExportJobStatus = 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'EXPIRED'

type BillPdfExportFailedItem = {
  dueId: string
  message: string
}

type BillPdfExportJobPayload = {
  dueIds: string[]
}

type GeneratedBillPdf = {
  fileName: string
  buffer: Buffer
}

export type BillPdfExportJobRow = QueryResultRow & {
  id: string
  society_id: string
  requested_by_user_id: string
  status: BillPdfExportJobStatus
  request_payload: unknown
  total_count: number | string
  processed_count: number | string
  failed_count: number | string
  failed_items: unknown
  storage_file_id: string | null
  storage_object_key: string | null
  file_name: string | null
  file_size_bytes: number | string | null
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  expires_at: string
  created_at: string
  updated_at: string
}

export type BillPdfExportJobSummary = {
  id: string
  status: BillPdfExportJobStatus
  totalCount: number
  processedCount: number
  failedCount: number
  failedItems: BillPdfExportFailedItem[]
  fileName: string | null
  fileSizeBytes: number | null
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  expiresAt: string
  createdAt: string
  updatedAt: string
}

const jobColumns = `
  id,
  society_id,
  requested_by_user_id,
  status,
  request_payload,
  total_count::text as total_count,
  processed_count::text as processed_count,
  failed_count::text as failed_count,
  failed_items,
  storage_file_id::text as storage_file_id,
  storage_object_key,
  file_name,
  file_size_bytes::text as file_size_bytes,
  error_message,
  started_at::text as started_at,
  completed_at::text as completed_at,
  expires_at::text as expires_at,
  created_at::text as created_at,
  updated_at::text as updated_at
`

const storedPayloadSchema = z.object({
  dueIds: z.array(z.string().uuid()).max(maxBillPdfExportDueIds),
})

const parseJsonValue = (value: unknown) => {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

const parseFailedItems = (value: unknown): BillPdfExportFailedItem[] => {
  const parsed = parseJsonValue(value)

  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }

    const dueId = (item as { dueId?: unknown }).dueId
    const message = (item as { message?: unknown }).message

    if (typeof dueId !== 'string' || typeof message !== 'string') {
      return []
    }

    return [{ dueId, message }]
  })
}

const mapJobRow = (row: BillPdfExportJobRow): BillPdfExportJobSummary => ({
  id: row.id,
  status: row.status,
  totalCount: Number(row.total_count),
  processedCount: Number(row.processed_count),
  failedCount: Number(row.failed_count),
  failedItems: parseFailedItems(row.failed_items),
  fileName: row.file_name,
  fileSizeBytes: row.file_size_bytes == null ? null : Number(row.file_size_bytes),
  errorMessage: row.error_message,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof AppError) {
    const cause = error.details?.cause

    if (typeof cause === 'string' && cause.trim() && cause !== error.message) {
      return `${error.message} ${cause}`
    }
  }

  return error instanceof Error ? error.message : fallback
}

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const getBillPdfGenerationConcurrency = (dueCount: number) =>
  Math.min(
    dueCount,
    parsePositiveInteger(process.env.BILL_EXPORT_PDF_CONCURRENCY, 4),
    8,
  )

const getStoredPayload = (job: BillPdfExportJobRow): BillPdfExportJobPayload => {
  const parsed = storedPayloadSchema.safeParse(parseJsonValue(job.request_payload))

  if (!parsed.success) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'The bill export job payload is invalid.',
      details: {
        issues: parsed.error.issues,
      },
    })
  }

  return parsed.data
}

const findJobById = async (jobId: string) => {
  const result = await getDatabasePool().query<BillPdfExportJobRow>(
    `
      select ${jobColumns}
      from public.billing_bill_export_jobs
      where id = $1
      limit 1
    `,
    [jobId],
  )

  return result.rows[0] ?? null
}

export const createBillPdfExportJob = async ({
  societyId,
  requestedByUserId,
  request,
}: {
  societyId: string
  requestedByUserId: string
  request: BillPdfExportRequest
}) => {
  const dueIds = await resolveBillPdfExportDueIds(societyId, request, maxBillPdfExportDueIds)

  if (dueIds.length === 0) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'No bill PDFs matched this export request.',
    })
  }

  const result = await getDatabasePool().query<BillPdfExportJobRow>(
    `
      insert into public.billing_bill_export_jobs (
        society_id,
        requested_by_user_id,
        request_payload,
        total_count,
        expires_at
      )
      values ($1, $2, $3::jsonb, $4, timezone('utc', now()) + interval '24 hours')
      returning ${jobColumns}
    `,
    [
      societyId,
      requestedByUserId,
      JSON.stringify({ dueIds } satisfies BillPdfExportJobPayload),
      dueIds.length,
    ],
  )
  const row = result.rows[0]

  if (!row) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'Unable to create the bill export job.',
    })
  }

  return mapJobRow(row)
}

export const getBillPdfExportJobForUser = async ({
  jobId,
  societyId,
  requestedByUserId,
}: {
  jobId: string
  societyId: string
  requestedByUserId: string
}) => {
  const result = await getDatabasePool().query<BillPdfExportJobRow>(
    `
      select ${jobColumns}
      from public.billing_bill_export_jobs
      where id = $1
        and society_id = $2
        and requested_by_user_id = $3
      limit 1
    `,
    [jobId, societyId, requestedByUserId],
  )
  const row = result.rows[0]

  if (!row) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'The bill export job could not be found.',
    })
  }

  return {
    row,
    summary: mapJobRow(row),
  }
}

const claimBillPdfExportJob = async (jobId: string) => {
  const workerId = process.env.AWS_LAMBDA_LOG_STREAM_NAME ?? `bill-export-${process.pid}`
  const result = await getDatabasePool().query<BillPdfExportJobRow>(
    `
      update public.billing_bill_export_jobs
      set
        status = 'PROCESSING',
        locked_by = $2,
        locked_at = timezone('utc', now()),
        started_at = coalesce(started_at, timezone('utc', now())),
        error_message = null
      where id = $1
        and status = 'QUEUED'
      returning ${jobColumns}
    `,
    [jobId, workerId],
  )
  const row = result.rows[0]

  if (row) {
    return row
  }

  return findJobById(jobId)
}

const updateBillPdfExportProgress = async (
  jobId: string,
  processedCount: number,
  failedItems: BillPdfExportFailedItem[],
) => {
  await getDatabasePool().query(
    `
      update public.billing_bill_export_jobs
      set
        processed_count = $2,
        failed_count = $3,
        failed_items = $4::jsonb,
        locked_at = timezone('utc', now())
      where id = $1
    `,
    [jobId, processedCount, failedItems.length, JSON.stringify(failedItems)],
  )
}

const markBillPdfExportFailed = async (
  jobId: string,
  message: string,
  processedCount: number,
  failedItems: BillPdfExportFailedItem[],
) => {
  await getDatabasePool().query(
    `
      update public.billing_bill_export_jobs
      set
        status = 'FAILED',
        processed_count = $2,
        failed_count = $3,
        failed_items = $4::jsonb,
        error_message = $5,
        completed_at = timezone('utc', now()),
        locked_at = null,
        locked_by = null
      where id = $1
    `,
    [jobId, processedCount, failedItems.length, JSON.stringify(failedItems), message],
  )
}

export const processBillPdfExportJob = async (jobId: string) => {
  const claimedJob = await claimBillPdfExportJob(jobId)

  if (!claimedJob) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'The bill export job could not be found.',
    })
  }

  if (claimedJob.status !== 'PROCESSING') {
    return mapJobRow(claimedJob)
  }

  const payload = getStoredPayload(claimedJob)
  const usedNames = new Map<string, number>()
  const generatedBills = new Array<GeneratedBillPdf | null>(payload.dueIds.length).fill(null)
  const failedItems: BillPdfExportFailedItem[] = []
  let processedCount = 0
  let nextDueIndex = 0

  try {
    const generateWorker = async () => {
      while (nextDueIndex < payload.dueIds.length) {
        const dueIndex = nextDueIndex
        nextDueIndex += 1

        const dueId = payload.dueIds[dueIndex]
        if (!dueId) continue

        try {
          const bill = await generateMaintenanceBillPdf(dueId, {
            societyId: claimedJob.society_id,
            isStaff: true,
          })

          generatedBills[dueIndex] = {
            fileName: bill.fileName,
            buffer: bill.buffer,
          }
        } catch (error) {
          failedItems.push({
            dueId,
            message: getErrorMessage(error, 'Unable to generate this bill PDF.'),
          })
        } finally {
          processedCount += 1

          if (processedCount % 5 === 0 || processedCount === payload.dueIds.length) {
            await updateBillPdfExportProgress(claimedJob.id, processedCount, failedItems)
          }
        }
      }
    }

    await Promise.all(
      Array.from(
        { length: getBillPdfGenerationConcurrency(payload.dueIds.length) },
        generateWorker,
      ),
    )

    const zipEntries = generatedBills.flatMap((bill) => {
      if (!bill) {
        return []
      }

      return [{
        name: uniqueBillPdfZipEntryName(bill.fileName, usedNames),
        data: bill.buffer,
      }]
    })

    if (zipEntries.length === 0) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'No bill PDFs could be generated for this export.',
      })
    }

    const zipBuffer = createZipBuffer(zipEntries)

    if (zipBuffer.length > STORAGE_REPORT_EXPORT_MAX_FILE_SIZE_BYTES) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 413,
        message: `The bill export ZIP is larger than ${STORAGE_REPORT_EXPORT_MAX_FILE_SIZE_BYTES} bytes. Please export fewer bills at a time.`,
      })
    }

    const fileName = `maintenance-bills-${new Date().toISOString().slice(0, 10)}-${claimedJob.id.slice(0, 8)}.zip`
    const storageObjectKey = createStorageObjectKey({
      recordType: 'billing-bill-export-jobs',
      recordId: claimedJob.id,
      fileName,
    })
    const storedFile = await uploadPrivateFile({
      storageTargetKey: STORAGE_TARGETS.reportExports.key,
      storageObjectKey,
      originalFileName: fileName,
      mimeType: 'application/zip',
      sizeBytes: zipBuffer.length,
      body: zipBuffer,
      uploadedBy: claimedJob.requested_by_user_id,
      relation: {
        recordType: 'billing_bill_export_jobs',
        recordId: claimedJob.id,
      },
      checksum: createHash('sha256').update(zipBuffer).digest('hex'),
    })

    const result = await getDatabasePool().query<BillPdfExportJobRow>(
      `
        update public.billing_bill_export_jobs
        set
          status = 'READY',
          processed_count = $2,
          failed_count = $3,
          failed_items = $4::jsonb,
          storage_file_id = $5,
          storage_object_key = $6,
          file_name = $7,
          file_size_bytes = $8,
          error_message = null,
          completed_at = timezone('utc', now()),
          expires_at = timezone('utc', now()) + interval '24 hours',
          locked_at = null,
          locked_by = null
        where id = $1
        returning ${jobColumns}
      `,
      [
        claimedJob.id,
        processedCount,
        failedItems.length,
        JSON.stringify(failedItems),
        storedFile.id,
        storageObjectKey,
        fileName,
        zipBuffer.length,
      ],
    )

    return mapJobRow(result.rows[0]!)
  } catch (error) {
    const message = getErrorMessage(error, 'Could not prepare the bill export ZIP.')
    await markBillPdfExportFailed(claimedJob.id, message, processedCount, failedItems)
    throw error
  }
}

export const createBillPdfExportSignedUrl = async (job: BillPdfExportJobRow) => {
  if (
    job.status !== 'READY' ||
    !job.storage_object_key ||
    new Date(job.expires_at).getTime() <= Date.now()
  ) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'The bill export is not ready for download.',
    })
  }

  return createPrivateSignedUrl({
    storageTargetKey: STORAGE_TARGETS.reportExports.key,
    storageObjectKey: job.storage_object_key,
    expiresInSeconds: 10 * 60,
  })
}

export const cleanupExpiredBillPdfExports = async () => {
  const result = await getDatabasePool().query<BillPdfExportJobRow>(
    `
      select ${jobColumns}
      from public.billing_bill_export_jobs
      where status = 'READY'
        and expires_at <= timezone('utc', now())
      order by expires_at asc
      limit 25
    `,
  )
  let expiredJobs = 0
  let deletedFiles = 0

  for (const row of result.rows) {
    if (row.storage_object_key) {
      const deleteInput = {
        storageTargetKey: STORAGE_TARGETS.reportExports.key,
        storageObjectKey: row.storage_object_key,
        ...(row.storage_file_id ? { fileId: row.storage_file_id } : {}),
      }

      await deletePrivateFile(deleteInput)
      deletedFiles += 1
    }

    await getDatabasePool().query(
      `
        update public.billing_bill_export_jobs
        set
          status = 'EXPIRED',
          storage_file_id = null,
          storage_object_key = null
        where id = $1
      `,
      [row.id],
    )
    expiredJobs += 1
  }

  return {
    expiredJobs,
    deletedFiles,
  }
}
