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

export type SocietyPolicySettings = {
  billingTenure: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM'
  excessPaymentHandling: 'KEEP_AS_ADVANCE' | 'REFUND' | 'MANUAL_REVIEW'
  tenantPaymentsEnabled: boolean
  familyAccessEnabled: boolean
  notificationScope: 'ADMIN_ONLY' | 'ADMIN_AND_MANAGER' | 'CONFIGURABLE'
  financeApprovalRequired: boolean
  attachmentsRequired: boolean
  highValueThreshold: number
}

export type SocietyProfile = AuditFields & {
  id: string
  code: string
  name: string
  registrationNumber: string | null
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string
  pincode: string
  logoPath: string | null
  contactEmail: string | null
  contactPhone: string | null
  timezone: string
  isActive: boolean
  settings: SocietyPolicySettings
}

export type BlockSummary = AuditFields & {
  id: string
  societyId: string
  code: string
  name: string
  description: string | null
  sortOrder: number
  isActive: boolean
  flatCount?: number
  activeFlatCount?: number
}

export type FlatSummary = AuditFields & {
  id: string
  societyId: string
  blockId: string
  blockName: string
  flatNumber: string
  floorLabel: string | null
  unitType: string
  areaSqFt: number | null
  occupancyStatus: string
  isActive: boolean
  ownerCount?: number
  tenantCount?: number
}

export type FlatResidentRelationship = AuditFields & {
  id: string
  flatId: string
  userId: string
  residentName: string
  residentEmail: string
  residentMobileNumber: string
  relationshipType: string
  isPrimaryContact: boolean
  isBillingContact: boolean
  canLogin: boolean
  isActive: boolean
  ownershipPercent: number | null
  ownershipLabel: string | null
  ownershipStartDate: string | null
  leaseStartDate: string | null
  leaseEndDate: string | null
  contractStartDate: string | null
  contractEndDate: string | null
  occupancyStatus: string | null
  accessScope: string | null
  relationshipNote: string | null
  securityDepositAmount: number | null
  securityDepositNote: string | null
}

export type FlatDetail = FlatSummary & {
  duesSummary: {
    totalDueAmount: number
    totalBalanceAmount: number
    openDueCount: number
  }
  accessSummary: {
    activeResidents: number
    loginEnabledResidents: number
  }
  ticketSummary: {
    openTicketCount: number
    closedTicketCount: number
  }
  relationships: FlatResidentRelationship[]
}

export type ResidentSummary = AuditFields & {
  id: string
  societyId: string
  authUserId: string
  role: string
  fullName: string
  email: string
  mobileNumber: string
  whatsappNumber: string | null
  isWhatsappSameAsMobile: boolean
  profileImagePath: string | null
  canLogin: boolean
  emailVerified: boolean
  isActive: boolean
  kycStatus: string
  policeVerificationStatus: string
  flatCount?: number
  activeRelationshipCount?: number
}

export type ResidentDetail = ResidentSummary & {
  emergencyContactName: string | null
  emergencyContactNumber: string | null
  governmentIdType: string | null
  governmentIdNumber: string | null
  governmentIdDocumentPath: string | null
  ownershipProofPath: string | null
  leaseAgreementPath: string | null
  preferredNotificationChannels: string
  relationships: FlatResidentRelationship[]
}
