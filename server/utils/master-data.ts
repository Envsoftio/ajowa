import type { H3Event } from 'h3'
import { z } from 'zod'
import type { PoolClient } from 'pg'
import { AppError } from './errors'
import { getListQueryParams, getPaginationParams, validateInput } from './api'
import { writeAuditEvent, resolveAuditSeverity } from './audit'
import { getEventQuery, getEventRouterParam } from './http-event'
import type { AuditAction } from '~/shared/audit'
import type { SocietyPolicySettings } from '~/types/domain'

export const relationshipTypes = [
  'OWNER',
  'TENANT',
  'FAMILY_MEMBER',
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

const billingTenures = [
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY',
  'CUSTOM',
] as const

const excessPaymentHandlingOptions = [
  'KEEP_AS_ADVANCE',
  'REFUND',
  'MANUAL_REVIEW',
] as const

const notificationScopes = [
  'ADMIN_ONLY',
  'ADMIN_AND_MANAGER',
  'CONFIGURABLE',
] as const

const emptyTextMarkers = new Set(['', 'NA', 'N/A', 'NIL', '-', '--'])

const trimNullableText = (value: unknown) => {
  if (value == null) {
    return null
  }

  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  return emptyTextMarkers.has(trimmed.toUpperCase()) ? null : trimmed
}

const nullableTextSchema = (maxLength: number) =>
  z.preprocess(
    trimNullableText,
    z.string().max(maxLength).nullable().optional(),
  )

export const societyPolicySchema = z.object({
  billingTenure: z.enum(billingTenures),
  excessPaymentHandling: z.enum(excessPaymentHandlingOptions),
  tenantPaymentsEnabled: z.boolean(),
  familyAccessEnabled: z.boolean(),
  notificationScope: z.enum(notificationScopes),
  financeApprovalRequired: z.boolean(),
  attachmentsRequired: z.boolean(),
  highValueThreshold: z.coerce.number().nonnegative(),
  graceDays: z.coerce.number().int().nonnegative().default(0),
  lateFeePerDay: z.coerce.number().nonnegative().default(50),
})

export const societyProfileSchema = z.object({
  name: z.string().trim().min(2),
  registrationNumber: nullableTextSchema(150),
  addressLine1: z.string().trim().min(2),
  addressLine2: nullableTextSchema(300),
  city: z.string().trim().min(2),
  state: z.string().trim().min(2),
  pincode: z.string().trim().min(1).max(30),
  contactEmail: z.preprocess(
    trimNullableText,
    z.string().email().max(254).nullable().optional(),
  ),
  contactPhone: nullableTextSchema(40),
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
  ownershipStartDate: z.string().date().nullable().optional(),
  leaseStartDate: z.string().date().nullable().optional(),
  leaseEndDate: z.string().date().nullable().optional(),
  contractStartDate: z.string().date().nullable().optional(),
  contractEndDate: z.string().date().nullable().optional(),
  occupancyStatus: z.enum(occupancyStatuses).nullable().optional(),
  accessScope: z.enum(accessScopes).nullable().optional(),
  relationshipNote: z.string().trim().max(300).nullable().optional(),
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
  graceDays: 0,
  lateFeePerDay: 50,
}

const enumValue = <T extends readonly string[]>(
  value: unknown,
  options: T,
): T[number] | undefined =>
  typeof value === 'string' && options.includes(value)
    ? (value as T[number])
    : undefined

const nonNegativeNumberSetting = (value: unknown, fallback: number) => {
  const normalized =
    typeof value === 'string' ? value.trim().replace(/,/g, '') : value

  if (normalized == null || normalized === '') {
    return fallback
  }

  const number = Number(normalized)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

const nonNegativeIntegerSetting = (value: unknown, fallback: number) => {
  const number = nonNegativeNumberSetting(value, fallback)
  return Number.isInteger(number) ? number : fallback
}

export const getQuerySafe = (event: H3Event) => {
  return getEventQuery(event)
}

export const parseListQuery = (event: H3Event) =>
  getListQueryParams(getQuerySafe(event))
export const parsePaginationQuery = (event: H3Event) =>
  getPaginationParams(getQuerySafe(event))

export const readUuidParam = (event: H3Event, key = 'id') => {
  const value = getEventRouterParam(event, key)

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
      enumValue(normalized.billingTenure, billingTenures) ??
      enumValue(settings.billingFrequency, billingTenures) ??
      defaultSocietyPolicies.billingTenure,
    excessPaymentHandling:
      enumValue(normalized.excessPaymentHandling, excessPaymentHandlingOptions) ??
      (settings.advanceCredit === true
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
      enumValue(normalized.notificationScope, notificationScopes) ??
      enumValue(settings.managerBroadcastScope, notificationScopes) ??
      defaultSocietyPolicies.notificationScope,
    financeApprovalRequired:
      normalized.financeApprovalRequired ??
      defaultSocietyPolicies.financeApprovalRequired,
    attachmentsRequired:
      normalized.attachmentsRequired ??
      defaultSocietyPolicies.attachmentsRequired,
    highValueThreshold: nonNegativeNumberSetting(
      normalized.highValueThreshold ?? settings.highValueThreshold,
      settings.highValueConfirmation
        ? 10000
        : defaultSocietyPolicies.highValueThreshold,
    ),
    graceDays: nonNegativeIntegerSetting(
      normalized.graceDays ?? settings.graceDays,
      defaultSocietyPolicies.graceDays,
    ),
    lateFeePerDay: nonNegativeNumberSetting(
      normalized.lateFeePerDay ?? settings.lateFeePerDay,
      defaultSocietyPolicies.lateFeePerDay,
    ),
  }
}

export const ensureResidentRelationshipsAreValid = (input: ResidentInput) => {
  const primaryContactCounts = new Map<string, number>()
  const billingContactCounts = new Map<string, number>()
  const activeTenantCounts = new Map<string, number>()

  for (const relationship of input.relationships) {
    if (relationship.isPrimaryContact && relationship.isActive) {
      primaryContactCounts.set(
        relationship.flatId,
        (primaryContactCounts.get(relationship.flatId) ?? 0) + 1,
      )
    }

    if (relationship.isBillingContact && relationship.isActive) {
      billingContactCounts.set(
        relationship.flatId,
        (billingContactCounts.get(relationship.flatId) ?? 0) + 1,
      )
    }

    if (relationship.isActive && relationship.relationshipType === 'TENANT') {
      activeTenantCounts.set(
        relationship.flatId,
        (activeTenantCounts.get(relationship.flatId) ?? 0) + 1,
      )
    }
  }

  for (const [flatId, count] of primaryContactCounts.entries()) {
    if (count > 1) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: `Only one active primary contact is allowed for flat ${flatId}.`,
      })
    }
  }

  for (const [flatId, count] of billingContactCounts.entries()) {
    if (count > 1) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: `Only one active billing contact is allowed for flat ${flatId}.`,
      })
    }
  }

  for (const [flatId, count] of activeTenantCounts.entries()) {
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

export const validatePayload = <T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
) =>
  validateInput(schema, value)
