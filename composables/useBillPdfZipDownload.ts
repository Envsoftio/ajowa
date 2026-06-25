type BillPdfZipDownloadFilters = {
  search?: string | undefined
  billingPeriodId?: string | undefined
  chargeType?: string | undefined
  chargeTypes?: string[] | undefined
  status?: string | undefined
  balance?: string | undefined
  overdue?: string | undefined
  advance?: string | undefined
  sortBy?: string | undefined
  sortDirection?: string | undefined
}

type BillPdfZipDownloadPayload = {
  dueIds?: string[] | undefined
  filters?: BillPdfZipDownloadFilters | undefined
  limit?: number | undefined
  offset?: number | undefined
}

type BillPdfExportJobStatus = 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'EXPIRED'

type BillPdfExportFailedItem = {
  dueId: string
  message: string
}

type BillPdfExportJob = {
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

type BillPdfExportStartResponse = {
  ok: true
  data: {
    job: BillPdfExportJob
  }
}

type BillPdfExportStatusResponse = {
  ok: true
  data: {
    job: BillPdfExportJob
    downloadUrl: string | null
  }
}

const billPdfExportPollDelayMs = 1500
const billPdfExportMaxPolls = 600

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const readDownloadError = async (response: Response) => {
  try {
    const payload = await response.json() as {
      data?: { message?: string }
      error?: { message?: string }
      message?: string
    }
    return payload.error?.message ??
      payload.data?.message ??
      payload.message ??
      'Could not download bill PDFs.'
  } catch {
    return 'Could not download bill PDFs.'
  }
}

const triggerUrlDownload = (url: string) => {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export const useBillPdfZipDownload = () => {
  const toast = useToast()
  const downloadingBillPdfs = ref(false)
  const billPdfExportProgress = ref<BillPdfExportJob | null>(null)

  const startBillPdfExport = async (payload: BillPdfZipDownloadPayload) => {
    const response = await fetch('/api/admin/billing/dues/export-bills', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(await readDownloadError(response))
    }

    const result = await response.json() as BillPdfExportStartResponse
    return result.data.job
  }

  const getBillPdfExportStatus = async (jobId: string) => {
    const response = await fetch(`/api/admin/billing/dues/export-bills/${encodeURIComponent(jobId)}`, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(await readDownloadError(response))
    }

    return await response.json() as BillPdfExportStatusResponse
  }

  const pollBillPdfExport = async (job: BillPdfExportJob) => {
    let latestJob = job

    for (let attempt = 0; attempt < billPdfExportMaxPolls; attempt += 1) {
      billPdfExportProgress.value = latestJob

      if (latestJob.status === 'READY') {
        const status = await getBillPdfExportStatus(latestJob.id)
        billPdfExportProgress.value = status.data.job

        if (!status.data.downloadUrl) {
          throw new Error('The bill export finished, but no download link was created.')
        }

        return status.data
      }

      if (latestJob.status === 'FAILED') {
        throw new Error(latestJob.errorMessage ?? 'Could not prepare the bill export ZIP.')
      }

      if (latestJob.status === 'EXPIRED') {
        throw new Error('This bill export has expired. Please start a new download.')
      }

      await sleep(billPdfExportPollDelayMs)
      const status = await getBillPdfExportStatus(latestJob.id)
      latestJob = status.data.job

      if (latestJob.status === 'READY') {
        if (!status.data.downloadUrl) {
          throw new Error('The bill export finished, but no download link was created.')
        }

        billPdfExportProgress.value = latestJob
        return status.data
      }
    }

    throw new Error('The bill export is still preparing. Please try again in a few minutes.')
  }

  const showSuccessToast = (job: BillPdfExportJob) => {
    const readyCount = Math.max(0, job.totalCount - job.failedCount)

    toast.add({
      severity: job.failedCount > 0 ? 'warn' : 'success',
      summary: job.failedCount > 0 ? 'PDF bundle ready with warnings' : 'PDF bundle ready',
      detail: job.failedCount > 0
        ? `${readyCount} bill PDFs were bundled. ${job.failedCount} failed and were skipped.`
        : `${readyCount} bill PDF${readyCount === 1 ? '' : 's'} downloaded as one ZIP.`,
      life: 10000,
    })
  }

  const downloadBillPdfs = async (payload: BillPdfZipDownloadPayload) => {
    if (import.meta.server) return

    downloadingBillPdfs.value = true
    billPdfExportProgress.value = null

    try {
      const job = await startBillPdfExport(payload)
      billPdfExportProgress.value = job
      toast.add({
        severity: 'info',
        summary: 'Preparing PDF bundle',
        detail: `${job.totalCount} bill PDF${job.totalCount === 1 ? '' : 's'} queued for export.`,
        life: 5000,
      })

      const result = await pollBillPdfExport(job)
      if (!result.downloadUrl) {
        throw new Error('The bill export finished, but no download link was created.')
      }

      triggerUrlDownload(result.downloadUrl)
      showSuccessToast(result.job)
    } catch (error) {
      toast.add({
        severity: 'error',
        summary: 'Download failed',
        detail: error instanceof Error ? error.message : 'Could not download bill PDFs.',
        life: 10000,
      })
    } finally {
      downloadingBillPdfs.value = false
      billPdfExportProgress.value = null
    }
  }

  return {
    downloadingBillPdfs,
    billPdfExportProgress,
    downloadBillPdfs,
  }
}
