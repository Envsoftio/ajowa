export type Money = string

export type StoredFileUploadStatus = 'PENDING' | 'READY' | 'FAILED'

export type AuditFields = {
  createdAt: string
  createdBy?: string
  updatedAt: string
  updatedBy?: string
}

export type StoredFileMetadata = AuditFields & {
  id: string
  storageTargetKey: string
  storageObjectKey: string
  originalFileName: string
  mimeType: string
  sizeBytes: number
  checksum?: string
  uploadedBy: string
  uploadedAt: string
  relatedRecordType: string
  relatedRecordId: string
  uploadStatus: StoredFileUploadStatus
  lastError?: string
}
