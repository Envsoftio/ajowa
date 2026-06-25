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
}

type BillPdfDownloadStatus = 'SELECTING' | 'DOWNLOADING' | 'ZIPPING' | 'READY'

type BillPdfDownloadFailedItem = {
  dueId: string
  message: string
}

type BillPdfDownloadProgress = {
  status: BillPdfDownloadStatus
  totalCount: number
  processedCount: number
  failedCount: number
  failedItems: BillPdfDownloadFailedItem[]
}

type BillPdfSelectionResponse = {
  ok: true
  data: {
    ids: string[]
    total: number
  }
}

type BrowserPdfDownloadSuccess = {
  ok: true
  dueId: string
  fileName: string
  data: Uint8Array
}

type BrowserPdfDownloadFailure = {
  ok: false
  dueId: string
  message: string
}

type BrowserPdfDownloadResult = BrowserPdfDownloadSuccess | BrowserPdfDownloadFailure

type BrowserZipEntry = {
  name: string
  data: Uint8Array
  checksum: number
}

const billPdfDownloadConcurrency = 6
const textEncoder = new TextEncoder()
let crcTable: number[] | null = null

const toBlobPart = (bytes: Uint8Array): BlobPart => bytes as unknown as BlobPart

const getCrcTable = () => {
  if (crcTable) return crcTable

  crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }

    return value >>> 0
  })

  return crcTable
}

const crc32 = (data: Uint8Array) => {
  const table = getCrcTable()
  let crc = 0xffffffff

  for (const byte of data) {
    crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

const sanitizeZipEntryName = (value: string) =>
  value.replace(/"/g, '').replace(/[/\\?%*:|<>]/g, '-')

const uniqueZipEntryName = (fileName: string, usedNames: Map<string, number>) => {
  const safeName = sanitizeZipEntryName(fileName)
  const previousCount = usedNames.get(safeName) ?? 0
  usedNames.set(safeName, previousCount + 1)

  if (previousCount === 0) {
    return safeName
  }

  return safeName.replace(/\.pdf$/i, `-${previousCount + 1}.pdf`)
}

const parseContentDispositionFileName = (disposition: string | null) => {
  const encodedMatch = disposition?.match(/filename\*=UTF-8''([^;]+)/i)
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1])
    } catch {
      return encodedMatch[1]
    }
  }

  const quotedMatch = disposition?.match(/filename="([^"]+)"/i)
  if (quotedMatch?.[1]) return quotedMatch[1]

  const plainMatch = disposition?.match(/filename=([^;]+)/i)
  return plainMatch?.[1]?.trim()
}

const writeLocalZipHeader = (entry: BrowserZipEntry, encodedName: Uint8Array) => {
  const header = new Uint8Array(30 + encodedName.length)
  const view = new DataView(header.buffer)

  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 0x0800, true)
  view.setUint16(8, 0, true)
  view.setUint16(10, 0, true)
  view.setUint16(12, 0, true)
  view.setUint32(14, entry.checksum, true)
  view.setUint32(18, entry.data.length, true)
  view.setUint32(22, entry.data.length, true)
  view.setUint16(26, encodedName.length, true)
  view.setUint16(28, 0, true)
  header.set(encodedName, 30)

  return header
}

const writeCentralZipHeader = (
  entry: BrowserZipEntry,
  encodedName: Uint8Array,
  offset: number,
) => {
  const header = new Uint8Array(46 + encodedName.length)
  const view = new DataView(header.buffer)

  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 20, true)
  view.setUint16(8, 0x0800, true)
  view.setUint16(10, 0, true)
  view.setUint16(12, 0, true)
  view.setUint16(14, 0, true)
  view.setUint32(16, entry.checksum, true)
  view.setUint32(20, entry.data.length, true)
  view.setUint32(24, entry.data.length, true)
  view.setUint16(28, encodedName.length, true)
  view.setUint16(30, 0, true)
  view.setUint16(32, 0, true)
  view.setUint16(34, 0, true)
  view.setUint16(36, 0, true)
  view.setUint32(38, 0, true)
  view.setUint32(42, offset, true)
  header.set(encodedName, 46)

  return header
}

const writeEndOfCentralDirectory = (
  entryCount: number,
  centralDirectoryLength: number,
  centralDirectoryOffset: number,
) => {
  const header = new Uint8Array(22)
  const view = new DataView(header.buffer)

  view.setUint32(0, 0x06054b50, true)
  view.setUint16(4, 0, true)
  view.setUint16(6, 0, true)
  view.setUint16(8, entryCount, true)
  view.setUint16(10, entryCount, true)
  view.setUint32(12, centralDirectoryLength, true)
  view.setUint32(16, centralDirectoryOffset, true)
  view.setUint16(20, 0, true)

  return header
}

const createZipBlob = (entries: BrowserZipEntry[]) => {
  if (entries.length > 0xffff) {
    throw new Error('This ZIP has too many files for the browser download format.')
  }

  const localParts: BlobPart[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const encodedName = textEncoder.encode(entry.name.replace(/^\/+/, ''))
    const localHeader = writeLocalZipHeader(entry, encodedName)
    const centralHeader = writeCentralZipHeader(entry, encodedName, offset)

    localParts.push(toBlobPart(localHeader), toBlobPart(entry.data))
    centralParts.push(centralHeader)
    offset += localHeader.length + entry.data.length

    if (offset > 0xffffffff) {
      throw new Error('This ZIP is too large for browser ZIP creation.')
    }
  }

  const centralDirectoryOffset = offset
  const centralDirectoryLength = centralParts.reduce((sum, part) => sum + part.length, 0)

  if (centralDirectoryOffset + centralDirectoryLength > 0xffffffff) {
    throw new Error('This ZIP is too large for browser ZIP creation.')
  }

  const endOfCentralDirectory = writeEndOfCentralDirectory(
    entries.length,
    centralDirectoryLength,
    centralDirectoryOffset,
  )

  return new Blob([
    ...localParts,
    ...centralParts.map(toBlobPart),
    toBlobPart(endOfCentralDirectory),
  ], {
    type: 'application/zip',
  })
}

const triggerBlobDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

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

const uniqueDueIds = (dueIds: string[]) => Array.from(new Set(dueIds))

export const useBillPdfZipDownload = () => {
  const toast = useToast()
  const downloadingBillPdfs = ref(false)
  const billPdfDownloadProgress = ref<BillPdfDownloadProgress | null>(null)

  const setProgress = (
    status: BillPdfDownloadStatus,
    totalCount: number,
    processedCount: number,
    failedItems: BillPdfDownloadFailedItem[] = [],
  ) => {
    billPdfDownloadProgress.value = {
      status,
      totalCount,
      processedCount,
      failedCount: failedItems.length,
      failedItems: [...failedItems],
    }
  }

  const getBillPdfSelection = async (payload: BillPdfZipDownloadPayload) => {
    if (payload.dueIds?.length) {
      const ids = uniqueDueIds(payload.dueIds)
      return { ids, total: ids.length }
    }

    setProgress('SELECTING', 0, 0)
    const response = await fetch('/api/admin/billing/dues/download-bills/selection', {
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

    const result = await response.json() as BillPdfSelectionResponse
    return result.data
  }

  const downloadBillPdf = async (dueId: string): Promise<BrowserPdfDownloadResult> => {
    try {
      const response = await fetch(`/api/admin/billing/dues/${encodeURIComponent(dueId)}/bill`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(await readDownloadError(response))
      }

      const fileName = parseContentDispositionFileName(
        response.headers.get('content-disposition'),
      ) ?? `maintenance-bill-${dueId}.pdf`

      return {
        ok: true,
        dueId,
        fileName: fileName.replace(/\.zip$/i, '.pdf'),
        data: new Uint8Array(await response.arrayBuffer()),
      }
    } catch (error) {
      return {
        ok: false,
        dueId,
        message: error instanceof Error ? error.message : 'Could not download this bill PDF.',
      }
    }
  }

  const downloadBillPdfEntries = async (dueIds: string[]) => {
    const results = new Array<BrowserPdfDownloadResult>(dueIds.length)
    const failedItems: BillPdfDownloadFailedItem[] = []
    let nextIndex = 0
    let processedCount = 0

    setProgress('DOWNLOADING', dueIds.length, 0)

    const runWorker = async () => {
      while (nextIndex < dueIds.length) {
        const index = nextIndex
        nextIndex += 1

        const dueId = dueIds[index]!
        const result = await downloadBillPdf(dueId)
        results[index] = result

        if (!result.ok) {
          failedItems.push({
            dueId: result.dueId,
            message: result.message,
          })
        }

        processedCount += 1
        setProgress('DOWNLOADING', dueIds.length, processedCount, failedItems)
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(billPdfDownloadConcurrency, dueIds.length) },
        runWorker,
      ),
    )

    const usedNames = new Map<string, number>()
    const entries: BrowserZipEntry[] = []

    setProgress('ZIPPING', dueIds.length, processedCount, failedItems)

    for (const result of results) {
      if (!result?.ok) continue

      entries.push({
        name: uniqueZipEntryName(result.fileName, usedNames),
        data: result.data,
        checksum: crc32(result.data),
      })
    }

    return { entries, failedItems }
  }

  const showSuccessToast = (
    readyCount: number,
    failedItems: BillPdfDownloadFailedItem[],
  ) => {
    toast.add({
      severity: failedItems.length > 0 ? 'warn' : 'success',
      summary: failedItems.length > 0 ? 'PDF bundle ready with warnings' : 'PDF bundle ready',
      detail: failedItems.length > 0
        ? `${readyCount} bill PDFs were bundled. ${failedItems.length} failed and were skipped.`
        : `${readyCount} bill PDF${readyCount === 1 ? '' : 's'} downloaded as one ZIP.`,
      life: 10000,
    })
  }

  const downloadBillPdfs = async (payload: BillPdfZipDownloadPayload) => {
    if (import.meta.server) return

    downloadingBillPdfs.value = true
    billPdfDownloadProgress.value = null

    try {
      const selection = await getBillPdfSelection(payload)
      const dueIds = selection.ids

      if (dueIds.length === 0) {
        throw new Error('No bill PDFs matched this download request.')
      }

      toast.add({
        severity: 'info',
        summary: 'Preparing PDF bundle',
        detail: `${selection.total} bill PDF${selection.total === 1 ? '' : 's'} queued for browser download.`,
        life: 5000,
      })

      const { entries, failedItems } = await downloadBillPdfEntries(dueIds)

      if (entries.length === 0) {
        throw new Error('No bill PDFs could be downloaded.')
      }

      const fileName = `maintenance-bills-${new Date().toISOString().slice(0, 10)}.zip`
      const zipBlob = createZipBlob(entries)

      setProgress('READY', dueIds.length, dueIds.length, failedItems)
      triggerBlobDownload(zipBlob, fileName)
      showSuccessToast(entries.length, failedItems)
    } catch (error) {
      toast.add({
        severity: 'error',
        summary: 'Download failed',
        detail: error instanceof Error ? error.message : 'Could not download bill PDFs.',
        life: 10000,
      })
    } finally {
      downloadingBillPdfs.value = false
      billPdfDownloadProgress.value = null
    }
  }

  return {
    downloadingBillPdfs,
    billPdfDownloadProgress,
    downloadBillPdfs,
  }
}
