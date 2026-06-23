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
  camAdvancePaidUntil?: string | null
  camAdvanceNote?: string | null
  camAdvanceUpdatedAt?: string | null
  ownerCount?: number
  tenantCount?: number
}

export type FlatResidentRelationship = AuditFields & {
  id: string
  flatId: string
  blockName?: string | null
  flatNumber?: string | null
  userId: string
  residentName: string
  residentEmail: string | null
  residentMobileNumber: string | null
  relationshipType: string
  isPrimaryContact: boolean
  isBillingContact: boolean
  canLogin: boolean
  isActive: boolean
  ownershipStartDate: string | null
  leaseStartDate: string | null
  leaseEndDate: string | null
  contractStartDate: string | null
  contractEndDate: string | null
  occupancyStatus: string | null
  accessScope: string | null
  relationshipNote: string | null
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
  authUserId: string | null
  role: string
  fullName: string
  email: string | null
  sourceEmail?: string | null
  mobileNumber: string | null
  sourceContact?: string | null
  whatsappNumber: string | null
  isWhatsappSameAsMobile: boolean
  profileImagePath: string | null
  canLogin: boolean
  emailVerified: boolean
  isActive: boolean
  kycStatus: string
  policeVerificationStatus: string
  relationshipTypes?: string[]
  flatNumbers?: string[]
  flatCount?: number
  activeRelationshipCount?: number
}

export type ResidentPaymentSummary = AuditFields & {
  id: string
  payerUserId: string
  payerName: string | null
  flatId: string | null
  flatNumber: string | null
  blockName: string | null
  paymentDate: string
  amount: number
  mode: string
  status: string
  utrReference: string | null
  bankReference: string | null
  receiptNumber: string | null
}

export type ResidentDueSummary = AuditFields & {
  id: string
  billingPeriodLabel: string
  flatId: string
  flatNumber: string
  blockName: string
  dueDate: string
  totalAmount: number
  paidAmount: number
  balanceAmount: number
  status: string
}

export type ResidentServiceRequestSummary = AuditFields & {
  id: string
  requestNumber: string
  requesterUserId: string | null
  requesterName: string | null
  flatId: string | null
  flatLabel: string | null
  category: string
  title: string
  priority: string
  status: string
  dueByAt: string | null
  isSlaBreached: boolean
}

export type ResidentAccessLogSummary = {
  id: string
  userId: string | null
  userName: string | null
  flatId: string | null
  flatNumber: string | null
  blockName: string | null
  scanResult: string
  denialReason: string | null
  gateName: string | null
  scannedAt: string
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
  flatOccupants: FlatResidentRelationship[]
  dues: ResidentDueSummary[]
  payments: ResidentPaymentSummary[]
  serviceRequests: ResidentServiceRequestSummary[]
  accessLogs: ResidentAccessLogSummary[]
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

export type ServicePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY'

export type ServiceRequestStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED'
  | 'CANCELLED'
  | 'NEEDS_REASSIGNMENT'

export type ServiceRequestSource =
  | 'RESIDENT_REQUEST'
  | 'COMMON_AREA_REPORT'
  | 'STAFF_REPORTED'
  | 'ADMIN_CREATED'
  | 'SYSTEM_CREATED'

export type ServiceLocationType = 'FLAT' | 'COMMON_AREA' | 'SOCIETY_ASSET'

export type ServiceCommentVisibility = 'INTERNAL_NOTE' | 'RESIDENT_VISIBLE' | 'SYSTEM'

export type ServiceDepartment = AuditFields & {
  id: string
  societyId: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  allowsQueueVisibility: boolean
  staffCount?: number
  openTicketCount?: number
  staffAssignments?: ServiceStaffDepartmentAssignment[]
}

export type ServiceStaffDepartmentAssignment = {
  id: string
  departmentId: string
  userId: string
  fullName: string
  email: string
  isPrimary: boolean
  isActive: boolean
}

export type ServiceCategoryRoute = AuditFields & {
  id: string
  societyId: string
  categoryKey: string
  categoryLabel: string
  locationType: ServiceLocationType | null
  departmentId: string
  departmentName: string
  defaultPriority: ServicePriority | null
  isActive: boolean
}

export type ServiceSlaRule = AuditFields & {
  id: string
  societyId: string
  departmentId: string | null
  departmentName: string | null
  priority: ServicePriority
  acknowledgeWithinMinutes: number
  resolveWithinMinutes: number
  isActive: boolean
}

export type ServiceRequestSummary = AuditFields & {
  id: string
  societyId: string
  requestNumber: string
  requesterUserId: string | null
  requesterName: string | null
  requesterMobileNumber: string | null
  flatId: string | null
  flatLabel: string | null
  blockName: string | null
  departmentId: string | null
  departmentName: string | null
  assigneeUserId: string | null
  assigneeName: string | null
  category: string
  title: string
  description: string
  sourceType: ServiceRequestSource
  locationType: ServiceLocationType
  areaName: string | null
  assetReference: string | null
  priority: ServicePriority
  status: ServiceRequestStatus
  visibility: 'RESIDENT_VISIBLE' | 'INTERNAL_ONLY'
  firstResponseDueAt: string | null
  dueByAt: string | null
  firstRespondedAt: string | null
  acknowledgedAt: string | null
  resolvedAt: string | null
  closedAt: string | null
  reopenedAt: string | null
  escalationLevel: number
  isSlaBreached: boolean
  ageMinutes: number
  isOverdue: boolean
}

export type ServiceRequestEvent = {
  id: string
  serviceRequestId: string
  eventType: string
  actorUserId: string | null
  actorName: string | null
  visibility: ServiceCommentVisibility
  fromStatus: ServiceRequestStatus | null
  toStatus: ServiceRequestStatus | null
  metadata: Record<string, unknown>
  occurredAt: string
}

export type ServiceRequestComment = {
  id: string
  serviceRequestId: string
  authorUserId: string | null
  authorName: string | null
  visibility: ServiceCommentVisibility
  commentBody: string
  createdAt: string
}

export type ServiceRequestAttachment = {
  id: string
  serviceRequestId: string
  uploadedByUserId: string | null
  uploadedByName: string | null
  fileName: string
  filePath: string
  mimeType: string
  sizeBytes: number
  checksum: string | null
  downloadUrl?: string
  createdAt: string
}

export type ServiceRequestDetail = ServiceRequestSummary & {
  events: ServiceRequestEvent[]
  comments: ServiceRequestComment[]
  attachments: ServiceRequestAttachment[]
}

export type ServiceRequestQueueSummary = {
  open: number
  unassigned: number
  overdue: number
  emergency: number
  reopened: number
  assignedToday: number
  departmentQueue: number
  inProgress: number
  resolvedToday: number
  departmentBacklog: Array<{
    departmentId: string | null
    departmentName: string
    openCount: number
    overdueCount: number
  }>
}

// --- Phase 6: Billing Types ---

export type BillingFrequency = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM'
export type BillingPeriodChargeType = 'GENERAL' | 'CAM' | 'DG_SET'

export type BillingPeriodStatus = 'OPEN' | 'LOCKED' | 'CLOSED'

export type BillingPeriod = AuditFields & {
  id: string
  societyId: string
  label: string
  frequency: BillingFrequency
  chargeType: BillingPeriodChargeType
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
  chargeType?: 'CAM' | 'DG_SET' | 'OTHER'
  calculationMethod?: 'FIXED' | 'AREA_RATE'
  ratePerSqFt?: number
  areaSqFt?: number
  cycleMultiplier?: number
  cycleLabel?: string
  source?: string
  electricityType?: string
  meterNo?: string | null
  openingReading?: number | null
  closingReading?: number | null
  consumedUnits?: number | null
  ratePerUnit?: number | null
  tariffRateLabel?: string | null
  connectionLoad?: string | null
  state?: string | null
  stateCode?: string | null
  previousOutstanding?: number | null
  interestAmount?: number | null
}

export type MaintenanceChargeScope = 'SOCIETY_DEFAULT' | 'FLAT_TYPE' | 'FLAT'
export type MaintenanceChargeCalculationMethod = 'FIXED' | 'AREA_RATE'

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
  calculationMethod: MaintenanceChargeCalculationMethod
  ratePerSqFt: number | null
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
  billingPeriodChargeType?: BillingPeriodChargeType
  billingPeriodStartDate?: string
  billingPeriodEndDate?: string
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
  isCamAdvanceCovered?: boolean
  camAdvancePaidUntil?: string | null
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
  billingPeriodChargeType?: BillingPeriodChargeType
  cycleMultiplier: number
  cycleLabel: string
  totalFlats: number
  totalAmount: number
  skippedAdvanceCovered?: number
  skippedOverlappingCam?: number
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
  authUserId: string | null
  residentName: string
  residentEmail: string | null
  residentMobileNumber: string | null
  flatCount: number
  flats: {
    flatId: string
    flatNumber: string
    blockName: string
    relationshipType: string
    dueId: string
    dueStatus: string
    billingPeriodLabel: string
    dueDate: string
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

export type FinanceTransactionType = 'INCOME' | 'EXPENSE'

export type FinanceLifecycleStatus = 'DRAFT' | 'PENDING_REVIEW' | 'POSTED' | 'REJECTED' | 'RETURNED' | 'REVERSED' | 'CANCELLED'

export type FinancePaymentMode = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'CARD' | 'OTHER'

export type FinanceCategory = AuditFields & {
  id: string
  societyId: string | null
  code: string
  name: string
  transactionType: FinanceTransactionType
  categoryGroup: string
  accountHeadId: string | null
  accountHeadCode: string | null
  accountHeadName: string | null
  accountHeadType: AccountHeadType | null
  transactionCount: number
  requiresAttachment: boolean
  isSystem: boolean
  isActive: boolean
}

export type FinanceTransaction = AuditFields & {
  id: string
  societyId: string
  transactionType: FinanceTransactionType
  categoryId: string
  categoryName: string
  categoryGroup: string
  bankAccountId: string | null
  bankAccountName: string | null
  billingPeriodId: string | null
  billingPeriodLabel: string | null
  title: string
  description: string | null
  counterpartyName: string | null
  voucherNumber: string | null
  transactionDate: string
  amount: number
  status: FinanceLifecycleStatus
  journalVoucherNumber: string | null
  attachmentCount?: number
  hasAttachments?: boolean
  attachmentRequired?: boolean
  createdByName: string | null
  approvedByName: string | null
  approvedAt: string | null
  postedAt: string | null
  reversedAt: string | null
}

export type FinanceTransactionAttachment = AuditFields & {
  id: string
  transactionId: string
  fileName: string
  filePath: string
  mimeType: string
  sizeBytes: number
  checksum: string | null
  uploadedByUserId: string | null
  uploadedByName: string | null
  replacesAttachmentId: string | null
  replacedAt: string | null
  downloadUrl: string | null
}

export type FinanceJournalLine = {
  id: string
  journalEntryId: string
  lineNo: number
  accountHeadId: string
  accountHeadCode: string
  accountHeadName: string
  lineType: 'DEBIT' | 'CREDIT'
  amount: number
  description: string | null
}

export type FinanceAuditEvent = {
  id: string
  eventKey: string
  action: string
  severity: string
  actorName: string | null
  metadata: Record<string, unknown>
  beforeState: Record<string, unknown> | null
  afterState: Record<string, unknown> | null
  occurredAt: string
}

export type FinanceTransactionDetail = {
  transaction: FinanceTransaction
  attachments: FinanceTransactionAttachment[]
  journals: Array<FinanceJournalEntry & { lines: FinanceJournalLine[] }>
  auditEvents: FinanceAuditEvent[]
  linkedEntries: {
    originalVoucherNumber: string | null
    reversingVoucherNumber: string | null
  }
}

export type FinanceJournalEntry = AuditFields & {
  id: string
  societyId: string
  voucherNumber: string
  transactionId: string | null
  paymentId: string | null
  billingPeriodId: string | null
  billingPeriodLabel: string | null
  entryDate: string
  description: string | null
  status: FinanceLifecycleStatus
  postedByUserId: string | null
  postedByName: string | null
  postedAt: string | null
  reversalOfEntryId: string | null
  debitTotal: number
  creditTotal: number
  lineCount: number
}

export type FinancialPeriodClose = AuditFields & {
  id: string
  societyId: string
  startDate: string
  endDate: string
  notes: string | null
  openingBalance: number
  incomeTotal: number
  expenseTotal: number
  closingBalance: number
  validationSnapshot: Record<string, unknown>
  closedAt: string
  closedByUserId: string | null
  closedByName: string | null
  isReopened: boolean
  reopenedAt: string | null
  reopenedByUserId: string | null
  reopenedByName: string | null
  reopenReason: string | null
}

export type ReconciliationAccount = {
  accountHeadId: string
  code: string
  name: string
  headType: AccountHeadType
  debitTotal: number
  creditTotal: number
  balance: number
}
