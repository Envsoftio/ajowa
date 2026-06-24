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

const getDownloadFileName = (disposition: string | null) => {
  const match = disposition?.match(/filename="([^"]+)"/i)
  return match?.[1] ?? `maintenance-bills-${new Date().toISOString().slice(0, 10)}.zip`
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

  const downloadBillPdfs = async (payload: BillPdfZipDownloadPayload) => {
    if (import.meta.server) return

    downloadingBillPdfs.value = true

    try {
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

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')

      anchor.href = url
      anchor.download = getDownloadFileName(response.headers.get('content-disposition'))
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)

      toast.add({
        severity: 'success',
        summary: 'PDF bundle ready',
        detail: `${response.headers.get('x-bill-count') ?? 'Selected'} bill PDF${response.headers.get('x-bill-count') === '1' ? '' : 's'} downloaded as a ZIP.`,
        life: 8000,
      })
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
