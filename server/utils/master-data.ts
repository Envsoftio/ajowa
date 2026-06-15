import { getQuery, getRouterParam, type H3Event } from 'h3'
import { z } from 'zod'
import type { PoolClient } from 'pg'
import { AppError } from './errors'
import { getListQueryParams, getPaginationParams, validateInput } from './api'
import { writeAuditEvent, resolveAuditSeverity } from './audit'
import type { AuditAction } from '~/shared/audit'
import type { SocietyPolicySettings } from '~/types/domain'

export const relationshipTypes = [
  'OWNER',
  'CO_OWNER',
  'TENANT',
  'FAMILY_MEMBER',
  'SHOP_OWNER',
  'SHOP_TENANT',
  'COMMERCIAL_OCCUPANT',
] as const

export const occupancyStatuses = [
  'SELF_OCCUPIED',
  'TENANTED',
  'VACANT',
] as const
export const accessScopes = ['OWNERSHIP', 'TENANCY', 'HOUSEHOLD'] as const
export const verificationStatuses = [
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'NOT_REQUIRED',
] as const
export const appRoles = [
  'ADMIN',
  'MANAGER',
  'SERVICE_STAFF',
  'RESIDENT',
  'GUARD',
] as const
export const notificationPresets = [
  'PUSH',
  'EMAIL',
  'WHATSAPP',
  'IN_APP',
  'PUSH_AND_EMAIL',
  'PUSH_AND_WHATSAPP',
  'EMAIL_AND_WHATSAPP',
  'PUSH_EMAIL_WHATSAPP',
  'ALL_CHANNELS',
] as const

export const societyPolicySchema = z.object({
  billingTenure: z.enum([
    'MONTHLY',
    'QUARTERLY',
    'HALF_YEARLY',
    'YEARLY',
    'CUSTOM',
  ]),
  excessPaymentHandling: z.enum(['KEEP_AS_ADVANCE', 'REFUND', 'MANUAL_REVIEW']),
  tenantPaymentsEnabled: z.boolean(),
  familyAccessEnabled: z.boolean(),
  notificationScope: z.enum([
    'ADMIN_ONLY',
    'ADMIN_AND_MANAGER',
    'CONFIGURABLE',
  ]),
  financeApprovalRequired: z.boolean(),
  attachmentsRequired: z.boolean(),
  highValueThreshold: z.coerce.number().nonnegative(),
})

export const societyProfileSchema = z.object({
  name: z.string().trim().min(2),
  registrationNumber: z.string().trim().max(100).nullable().optional(),
  addressLine1: z.string().trim().min(2),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(2),
  state: z.string().trim().min(2),
  pincode: z.string().trim().min(4).max(12),
  logoPath: z.string().trim().max(500).nullable().optional(),
  contactEmail: z.string().trim().email().nullable().optional(),
  contactPhone: z.string().trim().min(8).max(20).nullable().optional(),
  timezone: z.string().trim().min(3),
  settings: societyPolicySchema,
})

export const blockSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

export const flatSchema = z.object({
  blockId: z.string().uuid(),
  flatNumber: z.string().trim().min(1).max(30),
  floorLabel: z.string().trim().max(30).nullable().optional(),
  unitType: z.string().trim().min(1).max(40),
  areaSqFt: z.coerce.number().positive().nullable().optional(),
  occupancyStatus: z.enum(occupancyStatuses),
  isActive: z.boolean().default(true),
})

export const residentRelationshipSchema = z.object({
  id: z.string().uuid().optional(),
  flatId: z.string().uuid(),
  relationshipType: z.enum(relationshipTypes),
  isPrimaryContact: z.boolean().default(false),
  isBillingContact: z.boolean().default(false),
  canLogin: z.boolean().default(true),
  isActive: z.boolean().default(true),
  ownershipPercent: z.coerce.number().positive().max(100).nullable().optional(),
  ownershipLabel: z.string().trim().max(100).nullable().optional(),
  ownershipStartDate: z.string().date().nullable().optional(),
  leaseStartDate: z.string().date().nullable().optional(),
  leaseEndDate: z.string().date().nullable().optional(),
  contractStartDate: z.string().date().nullable().optional(),
  contractEndDate: z.string().date().nullable().optional(),
  occupancyStatus: z.enum(occupancyStatuses).nullable().optional(),
  accessScope: z.enum(accessScopes).nullable().optional(),
  relationshipNote: z.string().trim().max(300).nullable().optional(),
  securityDepositAmount: z.coerce.number().nonnegative().nullable().optional(),
  securityDepositNote: z.string().trim().max(300).nullable().optional(),
})

export const residentSchema = z.object({
  role: z.enum(appRoles).default('RESIDENT'),
  fullName: z.string().trim().min(2),
  email: z.string().trim().email(),
  mobileNumber: z.string().trim().min(8).max(20),
  whatsappNumber: z.string().trim().min(8).max(20).nullable().optional(),
  isWhatsappSameAsMobile: z.boolean().default(true),
  profileImagePath: z.string().trim().max(500).nullable().optional(),
  emergencyContactName: z.string().trim().max(120).nullable().optional(),
  emergencyContactNumber: z.string().trim().max(20).nullable().optional(),
  governmentIdType: z.string().trim().max(80).nullable().optional(),
  governmentIdNumber: z.string().trim().max(80).nullable().optional(),
  governmentIdDocumentPath: z.string().trim().max(500).nullable().optional(),
  ownershipProofPath: z.string().trim().max(500).nullable().optional(),
  leaseAgreementPath: z.string().trim().max(500).nullable().optional(),
  kycStatus: z.enum(verificationStatuses).default('PENDING'),
  policeVerificationStatus: z.enum(verificationStatuses).default('PENDING'),
  canLogin: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sendInvite: z.boolean().default(false),
  preferredNotificationChannels: z
    .enum(notificationPresets)
    .default('ALL_CHANNELS'),
  relationships: z.array(residentRelationshipSchema).min(1),
})

export type SocietyProfileInput = z.infer<typeof societyProfileSchema>
export type BlockInput = z.infer<typeof blockSchema>
export type FlatInput = z.infer<typeof flatSchema>
export type ResidentInput = z.infer<typeof residentSchema>

export const defaultSocietyPolicies: z.infer<typeof societyPolicySchema> = {
  billingTenure: 'MONTHLY',
  excessPaymentHandling: 'KEEP_AS_ADVANCE',
  tenantPaymentsEnabled: true,
  familyAccessEnabled: true,
  notificationScope: 'CONFIGURABLE',
  financeApprovalRequired: true,
  attachmentsRequired: true,
  highValueThreshold: 10000,
}

export const getQuerySafe = (event: H3Event) => {
  if (!event.url) {
    const urlStr = event.node?.req?.url || event.req?.url
    if (urlStr) {
      try {
        event.url = new URL(urlStr, 'http://localhost')
      } catch {
        // Ignore
      }
    }
  }
  return getQuery(event)
}

export const parseListQuery = (event: H3Event) =>
  getListQueryParams(getQuerySafe(event))
export const parsePaginationQuery = (event: H3Event) =>
  getPaginationParams(getQuerySafe(event))

export const readUuidParam = (event: H3Event, key = 'id') => {
  const value = getRouterParam(event, key)

  if (!value || !z.string().uuid().safeParse(value).success) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Invalid ${key}.`,
    })
  }

  return value
}

export const assertManagedAccess = (role: string) => {
  if (!['ADMIN', 'MANAGER'].includes(role)) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'This action requires admin or manager access.',
    })
  }
}

export const normalizeSocietySettings = (
  value: unknown,
): SocietyPolicySettings => {
  const settings = (value ?? {}) as Record<string, unknown>
  const parsed = societyPolicySchema.partial().safeParse(settings)
  const normalized = parsed.success ? parsed.data : {}

  return {
    ...defaultSocietyPolicies,
    billingTenure:
      normalized.billingTenure ??
      (settings.billingFrequency as
        | SocietyPolicySettings['billingTenure']
        | undefined) ??
      defaultSocietyPolicies.billingTenure,
    excessPaymentHandling:
      normalized.excessPaymentHandling ??
      (settings.advanceCredit
        ? 'KEEP_AS_ADVANCE'
        : defaultSocietyPolicies.excessPaymentHandling),
    tenantPaymentsEnabled:
      normalized.tenantPaymentsEnabled ??
      (typeof settings.tenantPaymentPerFlat === 'boolean'
        ? settings.tenantPaymentPerFlat
        : defaultSocietyPolicies.tenantPaymentsEnabled),
    familyAccessEnabled:
      normalized.familyAccessEnabled ??
      (typeof settings.familyAccess === 'boolean'
        ? settings.familyAccess
        : defaultSocietyPolicies.familyAccessEnabled),
    notificationScope:
      normalized.notificationScope ??
      (settings.managerBroadcastScope as
        | SocietyPolicySettings['notificationScope']
        | undefined) ??
      defaultSocietyPolicies.notificationScope,
    financeApprovalRequired:
      normalized.financeApprovalRequired ??
      defaultSocietyPolicies.financeApprovalRequired,
    attachmentsRequired:
      normalized.attachmentsRequired ??
      defaultSocietyPolicies.attachmentsRequired,
    highValueThreshold: Number(
      settings.highValueThreshold ??
        (settings.highValueConfirmation
          ? 10000
          : defaultSocietyPolicies.highValueThreshold),
    ),
  }
}

export const ensureResidentRelationshipsAreValid = (input: ResidentInput) => {
  let primaryCount = 0
  let billingCount = 0
  const activeRelationshipCounts = new Map<string, number>()

  for (const relationship of input.relationships) {
    if (relationship.isPrimaryContact && relationship.isActive) {
      primaryCount += 1
    }

    if (relationship.isBillingContact && relationship.isActive) {
      billingCount += 1
    }

    if (
      relationship.isActive &&
      ['TENANT', 'SHOP_TENANT', 'COMMERCIAL_OCCUPANT'].includes(
        relationship.relationshipType,
      )
    ) {
      activeRelationshipCounts.set(
        relationship.flatId,
        (activeRelationshipCounts.get(relationship.flatId) ?? 0) + 1,
      )
    }
  }

  if (primaryCount > 1) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'Only one active primary contact is allowed per resident submission.',
    })
  }

  if (billingCount > 1) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'Only one active billing contact is allowed per resident submission.',
    })
  }

  for (const [flatId, count] of activeRelationshipCounts.entries()) {
    if (count > 1) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: `Only one active tenant household is allowed for flat ${flatId}.`,
      })
    }
  }
}

export const writeMasterAudit = async ({
  client,
  event,
  actorUserId,
  actorAuthUserId,
  action,
  eventKey,
  beforeState,
  afterState,
  metadata,
  relatedEntities,
  targetUserId,
  flatId,
}: {
  client: PoolClient
  event: H3Event
  actorUserId?: string
  actorAuthUserId?: string
  action: AuditAction
  eventKey: string
  beforeState?: Record<string, unknown> | null
  afterState?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
  relatedEntities: Array<{
    entityTable: string
    entityId: string
    entityLabel?: string
  }>
  targetUserId?: string
  flatId?: string
}) =>
  writeAuditEvent(client, event, {
    module: 'MASTER',
    eventKey,
    action,
    severity: resolveAuditSeverity(action),
    ...(actorUserId ? { actorUserId } : {}),
    ...(actorAuthUserId ? { actorAuthUserId } : {}),
    ...(targetUserId ? { targetUserId } : {}),
    ...(flatId ? { flatId } : {}),
    ...(metadata ? { metadata } : {}),
    ...(beforeState !== undefined ? { beforeState } : {}),
    ...(afterState !== undefined ? { afterState } : {}),
    relatedEntities,
  })

export const validatePayload = <T>(schema: z.ZodType<T>, value: unknown) =>
  validateInput(schema, value)
