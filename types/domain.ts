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
  graceDays: number
  lateFeePerDay: number
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

export type StaffSummary = AuditFields & {
  id: string
  societyId: string
  authUserId: string
  role: 'MANAGER' | 'SERVICE_STAFF' | 'GUARD'
  fullName: string
  email: string
  mobileNumber: string
  whatsappNumber: string | null
  canLogin: boolean
  emailVerified: boolean
  isActive: boolean
  permissions: string[]
}

// --- Phase 6: Billing Types ---

export type BillingFrequency = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM'

export type BillingPeriodStatus = 'OPEN' | 'LOCKED' | 'CLOSED'

export type BillingPeriod = AuditFields & {
  id: string
  societyId: string
  label: string
  frequency: BillingFrequency
  startDate: string
  endDate: string
  dueDate: string
  isLocked: boolean
  lockedAt: string | null
  lockReason: string | null
  status: BillingPeriodStatus
  dueCount?: number
  paidDueCount?: number
  unpaidDueCount?: number
}

export type ChargeBreakdownItem = {
  label: string
  amount: number
}

export type MaintenanceChargeScope = 'SOCIETY_DEFAULT' | 'FLAT_TYPE' | 'FLAT'

export type MaintenanceCharge = AuditFields & {
  id: string
  societyId: string
  billingPeriodId: string | null
  scope: MaintenanceChargeScope
  flatType: string | null
  flatId: string | null
  flatNumber: string | null
  chargeName: string
  amount: number
  effectiveStartDate: string | null
  effectiveEndDate: string | null
  chargeBreakdown: ChargeBreakdownItem[]
  isActive: boolean
}

export type DueStatus = 'DRAFT' | 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'WAIVED' | 'OVERDUE' | 'CANCELLED'

export type MaintenanceDue = AuditFields & {
  id: string
  societyId: string
  billingPeriodId: string
  billingPeriodLabel: string
  billingPeriodDueDate: string
  flatId: string
  flatNumber: string
  blockName: string
  unitType: string
  dueDate: string
  baseAmount: number
  lateFeeAmount: number
  waivedAmount: number
  paidAmount: number
  totalAmount: number
  balanceAmount: number
  status: DueStatus
  chargeBreakdown: ChargeBreakdownItem[]
  generatedAt: string
  primaryResidentName: string | null
  relationshipType?: string
  isBillingContact?: boolean
  canPayNow?: boolean
}

export type DueGenerationRequest = {
  billingPeriodId: string
  flatIds?: string[]
}

export type DueGenerationPreview = {
  billingPeriodId: string
  billingPeriodLabel: string
  billingPeriodDueDate: string
  totalFlats: number
  totalAmount: number
  flatTypeBreakdown: {
    flatType: string
    flatCount: number
    totalAmount: number
    chargeTemplate: ChargeBreakdownItem[]
  }[]
  warnings: string[]
}

export type BillingChargeConfig = {
  periodId: string | null
  graceDays: number
  lateFeePerDay: number
  billingTenure: BillingFrequency
  excessPaymentHandling: SocietyPolicySettings['excessPaymentHandling']
  defaultCharges: ChargeBreakdownItem[]
  flatTypeCharges: {
    flatType: string
    label: string
    charges: ChargeBreakdownItem[]
  }[]
  flatOverrideCharges: {
    flatId: string
    flatNumber: string
    blockName: string
    charges: ChargeBreakdownItem[]
  }[]
}

export type DefaulterSummary = {
  userId: string
  authUserId: string
  residentName: string
  residentEmail: string
  residentMobileNumber: string
  flatCount: number
  flats: {
    flatId: string
    flatNumber: string
    blockName: string
    relationshipType: string
    dueId: string
    dueStatus: string
    billingPeriodLabel: string
    totalAmount: number
    paidAmount: number
    balanceAmount: number
    daysOverdue: number
  }[]
  totalDue: number
  totalPaid: number
  totalBalance: number
  maxDaysOverdue: number
}

// --- Phase 9: Finance Types ---

export type AccountHeadType = 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY'

export type BankAccountType = 'SAVINGS' | 'CURRENT' | 'CASH_CREDIT' | 'OVERDRAFT' | 'OTHER'

export type AccountHead = AuditFields & {
  id: string
  societyId: string | null
  parentId: string | null
  parentName: string | null
  code: string
  name: string
  headType: AccountHeadType
  isSystem: boolean
  isActive: boolean
  allowsManualEntries: boolean
  level: number
  hasChildren: boolean
  mappedBankAccountCount: number
  balance: number
}

export type BankAccount = AuditFields & {
  id: string
  societyId: string
  accountHeadId: string
  accountHeadCode: string
  accountHeadName: string
  bankName: string
  accountName: string
  accountNumberMasked: string
  ifscCode: string
  accountType: BankAccountType
  branchName: string | null
  upiId: string | null
  isDefault: boolean
  isActive: boolean
  balance: number
}
