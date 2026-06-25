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

type ZipDownloadResult = {
  billCount: number
  totalBillCount: number | null
}

type ZipDownloadOptions = {
  part?: number | undefined
  totalParts?: number | undefined
}

const billPdfZipBatchSize = 25

const parseHeaderNumber = (value: string | null) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

const chunkDueIds = (dueIds: string[], size: number) => {
  const chunks: string[][] = []

  for (let index = 0; index < dueIds.length; index += size) {
    chunks.push(dueIds.slice(index, index + size))
  }

  return chunks
}

const appendPartToFileName = (fileName: string, options: ZipDownloadOptions) => {
  if (!options.part || !options.totalParts || options.totalParts <= 1) {
    return fileName
  }

  const suffix = `-part-${options.part}-of-${options.totalParts}`
  const extensionMatch = fileName.match(/(\.[^.]+)$/)

  if (!extensionMatch?.[1]) {
    return `${fileName}${suffix}`
  }

  return `${fileName.slice(0, -extensionMatch[1].length)}${suffix}${extensionMatch[1]}`
}

const getDownloadFileName = (disposition: string | null, options: ZipDownloadOptions = {}) => {
  const match = disposition?.match(/filename="([^"]+)"/i)
  const fileName = match?.[1] ?? `maintenance-bills-${new Date().toISOString().slice(0, 10)}.zip`

  return appendPartToFileName(fileName, options)
}

const readDownloadError = async (response: Response) => {
  try {
    const payload = await response.json() as { data?: { message?: string }; message?: string }
    return payload.data?.message ?? payload.message ?? 'Could not download bill PDFs.'
  } catch {
    return 'Could not download bill PDFs.'
  }
}

export const useBillPdfZipDownload = () => {
  const toast = useToast()
  const downloadingBillPdfs = ref(false)

  const downloadZip = async (
    payload: BillPdfZipDownloadPayload,
    options: ZipDownloadOptions = {},
  ): Promise<ZipDownloadResult> => {
    const response = await fetch('/api/admin/billing/dues/download-bills', {
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

    const billCount = parseHeaderNumber(response.headers.get('x-bill-count')) ?? 0
    const totalBillCount = parseHeaderNumber(response.headers.get('x-total-bill-count'))
    const totalParts = options.totalParts
      ?? (payload.limit && totalBillCount && totalBillCount > payload.limit
        ? Math.ceil(totalBillCount / payload.limit)
        : undefined)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = getDownloadFileName(response.headers.get('content-disposition'), {
      part: options.part,
      totalParts,
    })
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)

    return { billCount, totalBillCount }
  }

  const showSuccessToast = (billCount: number, zipCount: number) => {
    toast.add({
      severity: 'success',
      summary: 'PDF bundle ready',
      detail: zipCount > 1
        ? `${billCount} bill PDF${billCount === 1 ? '' : 's'} downloaded in ${zipCount} ZIP files.`
        : `${billCount} bill PDF${billCount === 1 ? '' : 's'} downloaded as a ZIP.`,
      life: 8000,
    })
  }

  const downloadSelectedDueIds = async (dueIds: string[]) => {
    const chunks = chunkDueIds(dueIds, billPdfZipBatchSize)
    let billCount = 0

    for (const [index, chunk] of chunks.entries()) {
      const result = await downloadZip(
        { dueIds: chunk },
        { part: index + 1, totalParts: chunks.length },
      )
      billCount += result.billCount
    }

    showSuccessToast(billCount, chunks.length)
  }

  const downloadFilteredDues = async (payload: BillPdfZipDownloadPayload) => {
    let offset = payload.offset ?? 0
    let totalBillCount: number | null = null
    let billCount = 0
    let zipCount = 0

    while (true) {
      const result = await downloadZip(
        {
          ...payload,
          limit: billPdfZipBatchSize,
          offset,
        },
        { part: zipCount + 1 },
      )

      zipCount += 1
      billCount += result.billCount
      totalBillCount = result.totalBillCount ?? totalBillCount
      offset += result.billCount

      if (
        result.billCount < billPdfZipBatchSize ||
        (totalBillCount != null && offset >= totalBillCount)
      ) {
        break
      }
    }

    showSuccessToast(billCount, zipCount)
  }

  const downloadBillPdfs = async (payload: BillPdfZipDownloadPayload) => {
    if (import.meta.server) return

    downloadingBillPdfs.value = true

    try {
      if (payload.dueIds?.length) {
        await downloadSelectedDueIds(payload.dueIds)
      } else {
        await downloadFilteredDues(payload)
      }
    } catch (error) {
      toast.add({
        severity: 'error',
        summary: 'Download failed',
        detail: error instanceof Error ? error.message : 'Could not download bill PDFs.',
        life: 10000,
      })
    } finally {
      downloadingBillPdfs.value = false
    }
  }

  return {
    downloadingBillPdfs,
    downloadBillPdfs,
  }
}
