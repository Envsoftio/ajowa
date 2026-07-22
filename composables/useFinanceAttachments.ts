import type { FinanceTransactionAttachment } from '~/types/domain'

export type LocalFinanceAttachment = {
  file: File
  previewUrl: string
  fileName: string
  mimeType: string
  sizeBytes: number
}

const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png']
const maxSizeBytes = 10 * 1024 * 1024

export const useFinanceAttachments = () => {
  const toast = useToast()
  const api = useApi()
  const attachment = ref<LocalFinanceAttachment | null>(null)

  const setAttachment = (file: File) => {
    if (!allowedMimeTypes.includes(file.type)) {
      toast.add({
        severity: 'warn',
        summary: 'Unsupported file',
        detail: 'Upload a PDF, JPG, JPEG, or PNG invoice/document.',
        life: 10000,
      })
      return false
    }

    if (file.size > maxSizeBytes) {
      toast.add({
        severity: 'warn',
        summary: 'File too large',
        detail: 'Finance attachments must be 10 MB or smaller.',
        life: 10000,
      })
      return false
    }

    if (attachment.value?.previewUrl) {
      URL.revokeObjectURL(attachment.value.previewUrl)
    }

    attachment.value = {
      file,
      previewUrl: URL.createObjectURL(file),
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    }

    return true
  }

  const clearAttachment = () => {
    if (attachment.value?.previewUrl) {
      URL.revokeObjectURL(attachment.value.previewUrl)
    }
    attachment.value = null
  }

  const uploadAttachment = async (
    transactionId: string,
    file: File,
    replacesAttachmentId?: string | null,
    options?: { showErrorToast?: boolean },
  ) => {
    const formData = new FormData()
    formData.append('file', file)
    if (replacesAttachmentId) {
      formData.append('replacesAttachmentId', replacesAttachmentId)
    }
    const requestOptions = {
      method: 'POST' as const,
      body: formData,
      ...(options?.showErrorToast === undefined
        ? {}
        : { showErrorToast: options.showErrorToast }),
    }

    return await api<{ ok: true; data: FinanceTransactionAttachment }>(
      `/api/admin/finance/transactions/${transactionId}/attachments`,
      requestOptions,
    )
  }

  onBeforeUnmount(clearAttachment)

  return {
    attachment,
    allowedMimeTypes,
    maxSizeBytes,
    setAttachment,
    clearAttachment,
    uploadAttachment,
  }
}
