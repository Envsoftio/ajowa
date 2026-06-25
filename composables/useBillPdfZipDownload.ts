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

type BrowserZipEntry = {
  name: string
  data: Uint8Array
}

const billPdfZipBatchSize = 25
const billPdfDownloadConcurrency = 3
const textEncoder = new TextEncoder()
let crcTable: number[] | null = null

const parseHeaderNumber = (value: string | null) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

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

const writeUInt16 = (value: number) => {
  const bytes = new Uint8Array(2)
  new DataView(bytes.buffer).setUint16(0, value, true)
  return bytes
}

const writeUInt32 = (value: number) => {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true)
  return bytes
}

const concatBytes = (parts: Uint8Array[]) => {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
  const bytes = new Uint8Array(totalLength)
  let offset = 0

  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }

  return bytes
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

const createZipBlob = (entries: BrowserZipEntry[]) => {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const data = entry.data
    const name = textEncoder.encode(entry.name.replace(/^\/+/, ''))
    const checksum = crc32(data)
    const localHeader = concatBytes([
      writeUInt32(0x04034b50),
      writeUInt16(20),
      writeUInt16(0x0800),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(checksum),
      writeUInt32(data.length),
      writeUInt32(data.length),
      writeUInt16(name.length),
      writeUInt16(0),
      name,
    ])

    localParts.push(localHeader, data)
    centralParts.push(concatBytes([
      writeUInt32(0x02014b50),
      writeUInt16(20),
      writeUInt16(20),
      writeUInt16(0x0800),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(checksum),
      writeUInt32(data.length),
      writeUInt32(data.length),
      writeUInt16(name.length),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(0),
      writeUInt32(offset),
      name,
    ]))

    offset += localHeader.length + data.length
  }

  const centralDirectory = concatBytes(centralParts)
  const endOfCentralDirectory = concatBytes([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(entries.length),
    writeUInt16(entries.length),
    writeUInt32(centralDirectory.length),
    writeUInt32(offset),
    writeUInt16(0),
  ])

  return new Blob([concatBytes([...localParts, centralDirectory, endOfCentralDirectory])], {
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
  URL.revokeObjectURL(url)
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
    triggerBlobDownload(
      await response.blob(),
      getDownloadFileName(response.headers.get('content-disposition'), {
        part: options.part,
        totalParts,
      }),
    )

    return { billCount, totalBillCount }
  }

  const downloadBillPdfEntry = async (dueId: string, usedNames: Map<string, number>) => {
    const response = await fetch(`/api/admin/billing/dues/${encodeURIComponent(dueId)}/bill`, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(await readDownloadError(response))
    }

    const fileName = getDownloadFileName(
      response.headers.get('content-disposition'),
    ).replace(/\.zip$/i, '.pdf')

    return {
      name: uniqueZipEntryName(fileName, usedNames),
      data: new Uint8Array(await response.arrayBuffer()),
    }
  }

  const downloadBillPdfEntries = async (dueIds: string[]) => {
    const entries = new Array<BrowserZipEntry>(dueIds.length)
    const usedNames = new Map<string, number>()
    let nextIndex = 0

    const runWorker = async () => {
      while (nextIndex < dueIds.length) {
        const index = nextIndex
        nextIndex += 1
        entries[index] = await downloadBillPdfEntry(dueIds[index]!, usedNames)
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(billPdfDownloadConcurrency, dueIds.length) },
        runWorker,
      ),
    )

    return entries
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
    if (dueIds.length === 0) {
      throw new Error('No bill PDFs matched this download request.')
    }

    const entries = await downloadBillPdfEntries(dueIds)
    const zipBlob = createZipBlob(entries)
    const fileName = `maintenance-bills-${new Date().toISOString().slice(0, 10)}.zip`

    triggerBlobDownload(zipBlob, fileName)
    showSuccessToast(entries.length, 1)
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
