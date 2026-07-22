import { createHash } from 'node:crypto'
import process from 'node:process'
import type { H3Event } from 'h3'
import { z } from 'zod'
import {
  AD_CAMPAIGN_STATUSES,
  AD_EVENT_TYPES,
  AD_TARGETING_SCOPES,
  RESIDENT_AD_SLOT_KEYS,
  type AdEventType,
  type ResidentAdSlotKey,
} from '~/shared/ads'
import type { AuthMe, AuthFlatAccess } from '~/types/auth'
import type {
  AdTargeting,
  AdsAdminCampaign,
  AdsAdminCreative,
  AdsAdminEventItem,
  AdsStats,
  ResidentAdItem,
} from '~/types/ads'
import { AppError } from './errors'
import { queryRows } from './database'
import { getValidatedRuntimeConfig } from './env'
import { getRequestLogger } from './logging'

type AdsManagementContext = {
  societyId: string
  apiKeyId: string
  scopes: string[]
}

type AdCampaignRow = {
  id: string
  society_id: string
  name: string
  description: string | null
  status: AdsAdminCampaign['status']
  starts_at: string | null
  ends_at: string | null
  priority: number
  targeting: unknown
  frequency_cap: unknown
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: string
  updated_at: string
}

type AdCreativeRow = {
  id: string
  campaign_id: string
  society_id: string
  slot_key: string
  title: string
  body: string | null
  cta_label: string | null
  image_url: string
  destination_url: string
  display_order: number
  is_active: boolean
  allow_dismiss: boolean
  metadata: unknown
  created_at: string
  updated_at: string
}

type DeliverableAdRow = AdCreativeRow & {
  campaign_id: string
  campaign_priority: number
  campaign_created_at: string
  campaign_targeting: unknown
}

type AdsApiKeyRow = {
  id: string
  society_id: string
  scopes: string[]
  expires_at: string | null
  revoked_at: string | null
}

type StatsCountRow = {
  impressions: string
  unique_viewers: string
  clicks: string
  unique_clickers: string
  dismissals: string
}

type StatsSlotRow = {
  slot_key: string
  impressions: string
  clicks: string
  dismissals: string
}

type StatsDayRow = StatsSlotRow & {
  day: string
}

const uuidSchema = z.string().uuid()
const optionalNullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value))

const targetingSchema = z
  .object({
    scope: z.enum(AD_TARGETING_SCOPES),
    blockIds: z.array(uuidSchema).optional(),
    flatIds: z.array(uuidSchema).optional(),
    userIds: z.array(uuidSchema).optional(),
  })
  .superRefine((targeting, ctx) => {
    const requireIds = (
      key: 'blockIds' | 'flatIds' | 'userIds',
      message: string,
    ) => {
      if ((targeting[key]?.length ?? 0) === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message,
        })
      }
    }

    if (targeting.scope === 'BLOCKS') {
      requireIds('blockIds', 'Select at least one block.')
    }
    if (targeting.scope === 'FLATS') {
      requireIds('flatIds', 'Select at least one flat.')
    }
    if (targeting.scope === 'USERS') {
      requireIds('userIds', 'Select at least one user.')
    }
    if (
      targeting.scope === 'OWNER_OF_FLAT' &&
      targeting.flatIds?.length !== 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['flatIds'],
        message: 'Select exactly one flat.',
      })
    }
  })

const jsonObjectSchema = z.record(z.unknown()).transform((value) => value ?? {})

const campaignFields = {
  name: z.string().trim().min(1).max(160),
  description: optionalNullableText(1000),
  status: z.enum(AD_CAMPAIGN_STATUSES),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  priority: z.coerce.number().int(),
  targeting: targetingSchema,
  frequencyCap: jsonObjectSchema,
}

const adsCampaignBaseSchema = z.object(campaignFields)

const refineCampaignSchedule = (
  input: {
    startsAt?: string | null | undefined
    endsAt?: string | null | undefined
  },
  ctx: z.RefinementCtx,
) => {
  if (
    input.startsAt &&
    input.endsAt &&
    new Date(input.endsAt).getTime() < new Date(input.startsAt).getTime()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endsAt'],
      message: 'Campaign end must be after start.',
    })
  }
}

export const adsCampaignCreateSchema = z
  .object({
    ...campaignFields,
    status: campaignFields.status.default('DRAFT'),
    priority: campaignFields.priority.default(0),
    targeting: campaignFields.targeting.default({
      scope: 'ALL_ACTIVE_RESIDENTS',
    }),
    frequencyCap: campaignFields.frequencyCap.default({}),
  })
  .superRefine((input, ctx) => {
    refineCampaignSchedule(input, ctx)
  })

export const adsCampaignPatchSchema = adsCampaignBaseSchema
  .partial()
  .superRefine((input, ctx) => {
    refineCampaignSchedule(input, ctx)
  })

const disabledAllowDismissSchema = z.boolean().transform(() => false)

const creativeFields = {
  slotKey: z.enum(RESIDENT_AD_SLOT_KEYS),
  title: z.string().trim().min(1).max(120),
  body: optionalNullableText(240),
  ctaLabel: optionalNullableText(40),
  imageUrl: z.string().trim().min(1).max(2000),
  destinationUrl: z.string().trim().min(1).max(2000),
  displayOrder: z.coerce.number().int(),
  isActive: z.boolean(),
  allowDismiss: disabledAllowDismissSchema,
  metadata: jsonObjectSchema,
}

const adsCreativeBaseSchema = z.object(creativeFields)

const refineCreativeUrls = (
  input: {
    imageUrl?: string | undefined
    destinationUrl?: string | undefined
    metadata?: Record<string, unknown> | undefined
  },
  ctx: z.RefinementCtx,
) => {
  if (input.imageUrl) {
    addUrlValidationIssue(ctx, input.imageUrl, ['imageUrl'], 'image')
  }
  if (input.destinationUrl) {
    addUrlValidationIssue(
      ctx,
      input.destinationUrl,
      ['destinationUrl'],
      'destination',
    )
  }

  for (const key of ['mobileImageUrl', 'desktopImageUrl'] as const) {
    const value = input.metadata?.[key]
    if (typeof value === 'string' && value.trim()) {
      addUrlValidationIssue(ctx, value, ['metadata', key], 'image')
    }
  }
}

export const adsCreativeCreateSchema = z
  .object({
    ...creativeFields,
    displayOrder: creativeFields.displayOrder.default(0),
    isActive: creativeFields.isActive.default(true),
    allowDismiss: creativeFields.allowDismiss.default(false),
    metadata: creativeFields.metadata.default({}),
  })
  .superRefine((input, ctx) => {
    refineCreativeUrls(input, ctx)
  })

export const adsCreativePatchSchema = adsCreativeBaseSchema
  .partial()
  .superRefine((input, ctx) => {
    refineCreativeUrls(input, ctx)
  })

export const adsResidentEventSchema = z.object({
  creativeId: uuidSchema,
  eventType: z.enum(AD_EVENT_TYPES),
  slotKey: z.enum(RESIDENT_AD_SLOT_KEYS),
  pagePath: optionalNullableText(500),
  flatId: uuidSchema.nullable().optional(),
  sessionKey: optionalNullableText(160),
  metadata: jsonObjectSchema.optional().default({}),
})

type ResidentAdEventInput = z.infer<typeof adsResidentEventSchema>

export const adsStatsQuerySchema = z.object({
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
})

export const adsAdminEventsQuerySchema = adsStatsQuerySchema.extend({
  campaignId: uuidSchema.optional(),
  creativeId: uuidSchema.optional(),
  eventType: z.enum(AD_EVENT_TYPES).optional(),
  userId: uuidSchema.optional(),
  flatId: uuidSchema.optional(),
  slotKey: z.enum(RESIDENT_AD_SLOT_KEYS).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
})

export const adsRedirectClickQuerySchema = z.object({
  slot: z.enum(RESIDENT_AD_SLOT_KEYS),
  pagePath: optionalNullableText(500),
})

const AD_EVENT_RATE_LIMIT_WINDOW_MS = 60 * 1000
const AD_EVENT_RATE_LIMIT_MAX = 90
const AD_IMPRESSION_DEDUPE_MINUTES = 5
const adEventRateBuckets = new Map<string, { count: number; resetAt: number }>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const arrayOfStrings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : undefined

const normalizeRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {}

const normalizeTargeting = (value: unknown): AdTargeting => {
  const record = normalizeRecord(value)
  const parsed = targetingSchema.safeParse(record)

  if (parsed.success) {
    return parsed.data
  }

  return {
    scope: 'ALL_ACTIVE_RESIDENTS',
    blockIds: arrayOfStrings(record.blockIds),
    flatIds: arrayOfStrings(record.flatIds),
    userIds: arrayOfStrings(record.userIds),
  }
}

const mapCampaign = (row: AdCampaignRow): AdsAdminCampaign => ({
  id: row.id,
  societyId: row.society_id,
  name: row.name,
  description: row.description,
  status: row.status,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  priority: Number(row.priority),
  targeting: normalizeTargeting(row.targeting),
  frequencyCap: normalizeRecord(row.frequency_cap),
  createdByUserId: row.created_by_user_id,
  updatedByUserId: row.updated_by_user_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapCreative = (row: AdCreativeRow): AdsAdminCreative => ({
  id: row.id,
  campaignId: row.campaign_id,
  societyId: row.society_id,
  slotKey: row.slot_key as ResidentAdSlotKey,
  title: row.title,
  body: row.body,
  ctaLabel: row.cta_label,
  imageUrl: row.image_url,
  destinationUrl: row.destination_url,
  displayOrder: Number(row.display_order),
  isActive: row.is_active,
  allowDismiss: false,
  metadata: normalizeRecord(row.metadata),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toCtr = (clicks: number, impressions: number) =>
  impressions > 0 ? Number((clicks / impressions).toFixed(4)) : 0

const firstHeaderValue = (value: string | string[] | undefined | null) => {
  const normalized = Array.isArray(value) ? value[0] : value
  return normalized?.split(',')[0]?.trim() || null
}

const getHeaderValue = (event: H3Event, name: string) => {
  const lowerName = name.toLowerCase()
  const webHeaders = event.req?.headers as unknown as Headers | undefined

  if (typeof webHeaders?.get === 'function') {
    return webHeaders.get(lowerName)
  }

  const nodeHeader = event.node?.req.headers?.[lowerName]
  return firstHeaderValue(nodeHeader)
}

const getClientIp = (event: H3Event) =>
  firstHeaderValue(getHeaderValue(event, 'x-forwarded-for')) ??
  getHeaderValue(event, 'x-real-ip') ??
  event.node?.req.socket?.remoteAddress ??
  null

const hashValue = (value: string) =>
  createHash('sha256').update(value).digest('hex')

const hashAdIp = (value: string) => {
  const salt =
    process.env.AD_EVENT_IP_HASH_SALT ??
    getValidatedRuntimeConfig().betterAuthSecret
  return hashValue(`${salt}:${value}`)
}

export const hashAdsApiToken = (token: string) => `sha256:${hashValue(token)}`

const pruneAdEventRateBuckets = (now: number) => {
  if (adEventRateBuckets.size <= 1000) {
    return
  }

  for (const [key, bucket] of adEventRateBuckets.entries()) {
    if (bucket.resetAt <= now) {
      adEventRateBuckets.delete(key)
    }
  }
}

const assertResidentAdEventRateLimit = (
  authMe: AuthMe,
  eventType: AdEventType,
) => {
  const now = Date.now()
  pruneAdEventRateBuckets(now)

  const key = `${authMe.user.id}:${eventType}`
  const bucket = adEventRateBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    adEventRateBuckets.set(key, {
      count: 1,
      resetAt: now + AD_EVENT_RATE_LIMIT_WINDOW_MS,
    })
    return
  }

  bucket.count += 1

  if (bucket.count > AD_EVENT_RATE_LIMIT_MAX) {
    throw new AppError({
      code: 'RATE_LIMITED',
      statusCode: 429,
      message: 'Too many ad events. Please try again shortly.',
    })
  }
}

const isLocalHttpUrl = (url: URL) =>
  url.protocol === 'http:' &&
  process.env.NODE_ENV !== 'production' &&
  (url.hostname === 'localhost' || url.hostname === '127.0.0.1')

const appOrigins = () => {
  try {
    const config = getValidatedRuntimeConfig()
    return new Set(
      [config.appUrl, config.public.appUrl, config.betterAuthUrl]
        .map((value) => {
          try {
            return new URL(value).origin
          } catch {
            return null
          }
        })
        .filter((value): value is string => Boolean(value)),
    )
  } catch {
    return new Set<string>()
  }
}

const validateAdWebUrl = (
  value: string,
  mode: 'image' | 'destination',
): string | null => {
  let parsed: URL

  try {
    parsed = new URL(value)
  } catch {
    return 'Use an absolute URL.'
  }

  if (parsed.protocol !== 'https:' && !isLocalHttpUrl(parsed)) {
    return 'Use an https:// URL. Local http:// URLs are allowed only in development.'
  }

  if (mode === 'destination' && appOrigins().has(parsed.origin)) {
    return 'Use an external destination URL, not an AJOWA route.'
  }

  return null
}

const addUrlValidationIssue = (
  ctx: z.RefinementCtx,
  value: string,
  path: Array<string | number>,
  mode: 'image' | 'destination',
) => {
  const message = validateAdWebUrl(value, mode)

  if (message) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message,
    })
  }
}

const requireResidentAccess = (authMe: AuthMe) => {
  if (!authMe.access.hasResidentAccess || authMe.flatAccess.length === 0) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'Resident access is required.',
    })
  }
}

const currentFlatAccess = (flatAccess: AuthFlatAccess) => {
  if (flatAccess.relationshipType !== 'TENANT') {
    return true
  }

  const today = new Date().toISOString().slice(0, 10)
  return !flatAccess.leaseEndDate || flatAccess.leaseEndDate >= today
}

const intersects = (a: string[], b: string[] | undefined) =>
  Boolean(b?.some((value) => a.includes(value)))

const residentIsInBlocks = async (
  accessibleFlatIds: string[],
  blockIds: string[] | undefined,
) => {
  if (!blockIds?.length || accessibleFlatIds.length === 0) {
    return false
  }

  const result = await queryRows<{ exists: boolean }>(
    `
      select exists (
        select 1
        from public.flats
        where id = any($1::uuid[])
          and block_id = any($2::uuid[])
          and is_active = true
      ) as exists
    `,
    [accessibleFlatIds, blockIds],
  )

  return Boolean(result.rows[0]?.exists)
}

const residentIsDefaulter = async (
  societyId: string,
  accessibleFlatIds: string[],
) => {
  if (accessibleFlatIds.length === 0) {
    return false
  }

  const result = await queryRows<{ exists: boolean }>(
    `
      select exists (
        select 1
        from public.maintenance_dues
        where society_id = $1
          and flat_id = any($2::uuid[])
          and balance_amount > 0
          and status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE')
      ) as exists
    `,
    [societyId, accessibleFlatIds],
  )

  return Boolean(result.rows[0]?.exists)
}

export const isResidentEligibleForAdTargeting = async (
  authMe: AuthMe,
  targetingValue: unknown,
) => {
  const targeting = normalizeTargeting(targetingValue)
  const flatAccess = authMe.flatAccess.filter(currentFlatAccess)
  const accessibleFlatIds = flatAccess.map((item) => item.flatId)

  switch (targeting.scope) {
    case 'ALL_ACTIVE_RESIDENTS':
      return authMe.access.hasResidentAccess && accessibleFlatIds.length > 0
    case 'BLOCKS':
      return residentIsInBlocks(accessibleFlatIds, targeting.blockIds)
    case 'FLATS':
      return intersects(accessibleFlatIds, targeting.flatIds)
    case 'USERS':
      return targeting.userIds?.includes(authMe.user.id) ?? false
    case 'OWNERS':
      return flatAccess.some((item) => item.relationshipType === 'OWNER')
    case 'OWNER_OF_FLAT':
      return flatAccess.some(
        (item) =>
          item.relationshipType === 'OWNER' &&
          targeting.flatIds?.includes(item.flatId),
      )
    case 'TENANTS':
      return flatAccess.some((item) => item.relationshipType === 'TENANT')
    case 'BILLING_CONTACTS':
      return flatAccess.some((item) => item.isBillingContact)
    case 'DEFAULTERS':
      return residentIsDefaulter(authMe.user.societyId, accessibleFlatIds)
    default:
      return false
  }
}

export const requireAdsManagementAuth = async (
  event: H3Event,
  requiredScope = 'ads.manage',
): Promise<AdsManagementContext> => {
  const authorization = getHeaderValue(event, 'authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()

  if (!token) {
    throw new AppError({
      code: 'AUTH_REQUIRED',
      statusCode: 401,
      message: 'Ads management API token is required.',
    })
  }

  const keyHash = hashAdsApiToken(token)
  const rawHash = hashValue(token)
  const result = await queryRows<AdsApiKeyRow>(
    `
      select id, society_id, scopes, expires_at::text, revoked_at::text
      from public.ad_api_keys
      where key_hash in ($1, $2)
      limit 1
    `,
    [keyHash, rawHash],
  )
  const apiKey = result.rows[0]

  if (
    !apiKey ||
    apiKey.revoked_at ||
    (apiKey.expires_at && new Date(apiKey.expires_at).getTime() <= Date.now())
  ) {
    throw new AppError({
      code: 'AUTH_REQUIRED',
      statusCode: 401,
      message: 'Ads management API token is invalid.',
    })
  }

  if (!apiKey.scopes.includes(requiredScope)) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'Ads management API token does not have the required scope.',
    })
  }

  await queryRows(
    `
      update public.ad_api_keys
      set last_used_at = now()
      where id = $1
    `,
    [apiKey.id],
  )

  return {
    societyId: apiKey.society_id,
    apiKeyId: apiKey.id,
    scopes: apiKey.scopes,
  }
}

export const listEligibleResidentAds = async (
  authMe: AuthMe,
  slotKey: ResidentAdSlotKey,
): Promise<ResidentAdItem[]> => {
  requireResidentAccess(authMe)

  const result = await queryRows<DeliverableAdRow>(
    `
      select
        cr.id,
        cr.campaign_id,
        cr.society_id,
        cr.slot_key,
        cr.title,
        cr.body,
        cr.cta_label,
        cr.image_url,
        cr.destination_url,
        cr.display_order,
        cr.is_active,
        cr.allow_dismiss,
        cr.metadata,
        cr.created_at::text,
        cr.updated_at::text,
        c.priority as campaign_priority,
        c.created_at::text as campaign_created_at,
        c.targeting as campaign_targeting
      from public.ad_creatives cr
      inner join public.ad_campaigns c on c.id = cr.campaign_id
      where cr.society_id = $1
        and c.society_id = $1
        and cr.slot_key = $2
        and cr.is_active = true
        and c.status = 'ACTIVE'
        and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at >= now())
      order by c.priority desc, cr.display_order asc, c.created_at desc, cr.id asc
      limit 25
    `,
    [authMe.user.societyId, slotKey],
  )

  for (const row of result.rows) {
    if (
      validateAdWebUrl(row.image_url, 'image') ||
      validateAdWebUrl(row.destination_url, 'destination')
    ) {
      continue
    }

    if (
      await isResidentEligibleForAdTargeting(authMe, row.campaign_targeting)
    ) {
      const metadata = normalizeRecord(row.metadata)
      const imageAlt =
        typeof metadata.imageAlt === 'string' && metadata.imageAlt.trim()
          ? metadata.imageAlt.trim()
          : row.title
      const sponsorLabel =
        typeof metadata.sponsorLabel === 'string' &&
        metadata.sponsorLabel.trim()
          ? metadata.sponsorLabel.trim()
          : 'Sponsored'

      return [
        {
          campaignId: row.campaign_id,
          creativeId: row.id,
          slotKey: row.slot_key as ResidentAdSlotKey,
          title: row.title,
          body: row.body,
          ctaLabel: row.cta_label,
          imageUrl: row.image_url,
          imageAlt,
          sponsorLabel,
          destinationUrl: row.destination_url,
          openMode: 'external-browser',
          allowDismiss: false,
        },
      ]
    }
  }

  return []
}

const loadDeliverableCreativeForResident = async (
  authMe: AuthMe,
  creativeId: string,
  slotKey: ResidentAdSlotKey,
) => {
  const result = await queryRows<DeliverableAdRow>(
    `
      select
        cr.id,
        cr.campaign_id,
        cr.society_id,
        cr.slot_key,
        cr.title,
        cr.body,
        cr.cta_label,
        cr.image_url,
        cr.destination_url,
        cr.display_order,
        cr.is_active,
        cr.allow_dismiss,
        cr.metadata,
        cr.created_at::text,
        cr.updated_at::text,
        c.priority as campaign_priority,
        c.created_at::text as campaign_created_at,
        c.targeting as campaign_targeting
      from public.ad_creatives cr
      inner join public.ad_campaigns c on c.id = cr.campaign_id
      where cr.id = $1
        and cr.slot_key = $2
        and cr.society_id = $3
        and c.society_id = $3
        and cr.is_active = true
        and c.status = 'ACTIVE'
        and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at >= now())
      limit 1
    `,
    [creativeId, slotKey, authMe.user.societyId],
  )
  const creative = result.rows[0]

  if (!creative) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Ad creative was not found.',
    })
  }

  if (
    validateAdWebUrl(creative.image_url, 'image') ||
    validateAdWebUrl(creative.destination_url, 'destination')
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Ad creative is not deliverable.',
    })
  }

  if (
    !(await isResidentEligibleForAdTargeting(
      authMe,
      creative.campaign_targeting,
    ))
  ) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'This ad is not available for your account.',
    })
  }

  return creative
}

const findRecentImpressionEvent = async (
  authMe: AuthMe,
  input: ResidentAdEventInput,
  sessionKey: string,
) => {
  if (input.eventType !== 'IMPRESSION') {
    return null
  }

  const result = await queryRows<{ id: string; occurred_at: string }>(
    `
      select id, occurred_at::text
      from public.ad_events
      where user_id = $1
        and creative_id = $2
        and event_type = 'IMPRESSION'
        and slot_key = $3
        and session_key = $4
        and occurred_at >= now() - ($5::int * interval '1 minute')
      order by occurred_at desc
      limit 1
    `,
    [
      authMe.user.id,
      input.creativeId,
      input.slotKey,
      sessionKey,
      String(AD_IMPRESSION_DEDUPE_MINUTES),
    ],
  )

  return result.rows[0] ?? null
}

export const logResidentAdEvent = async (
  event: H3Event,
  authMe: AuthMe,
  input: ResidentAdEventInput,
) => {
  requireResidentAccess(authMe)
  assertResidentAdEventRateLimit(authMe, input.eventType)

  const creative = await loadDeliverableCreativeForResident(
    authMe,
    input.creativeId,
    input.slotKey,
  )

  if (input.eventType === 'DISMISS') {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Ads cannot be dismissed.',
    })
  }

  if (
    input.flatId &&
    !authMe.flatAccess.some((flatAccess) => flatAccess.flatId === input.flatId)
  ) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'The selected flat is not linked to your account.',
    })
  }

  const clientIp = getClientIp(event)
  const userAgent = getHeaderValue(event, 'user-agent')?.slice(0, 500) ?? null
  const sessionKey = input.sessionKey ?? authMe.session.id
  const recentImpression = await findRecentImpressionEvent(
    authMe,
    input,
    sessionKey,
  )

  if (recentImpression) {
    return {
      eventId: recentImpression.id,
      occurredAt: recentImpression.occurred_at,
      deduped: true,
    }
  }

  const result = await queryRows<{ id: string; occurred_at: string }>(
    `
      insert into public.ad_events (
        society_id,
        campaign_id,
        creative_id,
        user_id,
        flat_id,
        event_type,
        slot_key,
        page_path,
        request_id,
        session_key,
        ip_hash,
        user_agent,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      returning id, occurred_at::text
    `,
    [
      authMe.user.societyId,
      creative.campaign_id,
      creative.id,
      authMe.user.id,
      input.flatId ?? null,
      input.eventType,
      input.slotKey,
      input.pagePath ?? null,
      getRequestLogger(event).requestId,
      sessionKey,
      clientIp ? hashAdIp(clientIp) : null,
      userAgent,
      JSON.stringify(input.metadata ?? {}),
    ],
  )

  return {
    eventId: result.rows[0]?.id ?? null,
    occurredAt: result.rows[0]?.occurred_at ?? null,
    deduped: false,
  }
}

export const logResidentAdClickAndGetDestination = async (
  event: H3Event,
  authMe: AuthMe,
  input: {
    creativeId: string
    slotKey: ResidentAdSlotKey
    pagePath?: string | null | undefined
  },
) => {
  const creative = await loadDeliverableCreativeForResident(
    authMe,
    input.creativeId,
    input.slotKey,
  )
  const tracked = await logResidentAdEvent(event, authMe, {
    creativeId: input.creativeId,
    eventType: 'CLICK',
    slotKey: input.slotKey,
    pagePath: input.pagePath ?? null,
    metadata: {
      source: 'redirect',
    },
  })

  return {
    ...tracked,
    destinationUrl: creative.destination_url,
  }
}

export const listAdsCampaigns = async (context: AdsManagementContext) => {
  const result = await queryRows<AdCampaignRow>(
    `
      select
        id,
        society_id,
        name,
        description,
        status::text as status,
        starts_at::text,
        ends_at::text,
        priority,
        targeting,
        frequency_cap,
        created_by_user_id,
        updated_by_user_id,
        created_at::text,
        updated_at::text
      from public.ad_campaigns
      where society_id = $1
      order by created_at desc
    `,
    [context.societyId],
  )

  return result.rows.map(mapCampaign)
}

export const getAdsCampaign = async (
  context: AdsManagementContext,
  id: string,
) => {
  const result = await queryRows<AdCampaignRow>(
    `
      select
        id,
        society_id,
        name,
        description,
        status::text as status,
        starts_at::text,
        ends_at::text,
        priority,
        targeting,
        frequency_cap,
        created_by_user_id,
        updated_by_user_id,
        created_at::text,
        updated_at::text
      from public.ad_campaigns
      where society_id = $1
        and id = $2
      limit 1
    `,
    [context.societyId, id],
  )
  const campaign = result.rows[0]

  if (!campaign) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Ad campaign was not found.',
    })
  }

  return mapCampaign(campaign)
}

export const createAdsCampaign = async (
  context: AdsManagementContext,
  input: z.infer<typeof adsCampaignCreateSchema>,
) => {
  const result = await queryRows<AdCampaignRow>(
    `
      insert into public.ad_campaigns (
        society_id,
        name,
        description,
        status,
        starts_at,
        ends_at,
        priority,
        targeting,
        frequency_cap
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
      returning
        id,
        society_id,
        name,
        description,
        status::text as status,
        starts_at::text,
        ends_at::text,
        priority,
        targeting,
        frequency_cap,
        created_by_user_id,
        updated_by_user_id,
        created_at::text,
        updated_at::text
    `,
    [
      context.societyId,
      input.name,
      input.description ?? null,
      input.status,
      input.startsAt ?? null,
      input.endsAt ?? null,
      input.priority,
      JSON.stringify(input.targeting),
      JSON.stringify(input.frequencyCap ?? {}),
    ],
  )

  const campaign = result.rows[0]

  if (!campaign) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'Ad campaign could not be created.',
    })
  }

  return mapCampaign(campaign)
}

export const updateAdsCampaign = async (
  context: AdsManagementContext,
  id: string,
  input: z.infer<typeof adsCampaignPatchSchema>,
) => {
  const values: unknown[] = [context.societyId, id]
  const updates: string[] = []
  const addUpdate = (column: string, value: unknown, cast = '') => {
    values.push(value)
    updates.push(`${column} = $${values.length}${cast}`)
  }

  if ('name' in input) addUpdate('name', input.name)
  if ('description' in input)
    addUpdate('description', input.description ?? null)
  if ('status' in input) addUpdate('status', input.status)
  if ('startsAt' in input) addUpdate('starts_at', input.startsAt ?? null)
  if ('endsAt' in input) addUpdate('ends_at', input.endsAt ?? null)
  if ('priority' in input) addUpdate('priority', input.priority)
  if ('targeting' in input) {
    addUpdate('targeting', JSON.stringify(input.targeting), '::jsonb')
  }
  if ('frequencyCap' in input) {
    addUpdate(
      'frequency_cap',
      JSON.stringify(input.frequencyCap ?? {}),
      '::jsonb',
    )
  }

  if (updates.length === 0) {
    return getAdsCampaign(context, id)
  }

  const result = await queryRows<AdCampaignRow>(
    `
      update public.ad_campaigns
      set ${updates.join(', ')}
      where society_id = $1
        and id = $2
      returning
        id,
        society_id,
        name,
        description,
        status::text as status,
        starts_at::text,
        ends_at::text,
        priority,
        targeting,
        frequency_cap,
        created_by_user_id,
        updated_by_user_id,
        created_at::text,
        updated_at::text
    `,
    values,
  )
  const campaign = result.rows[0]

  if (!campaign) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Ad campaign was not found.',
    })
  }

  return mapCampaign(campaign)
}

export const archiveAdsCampaign = async (
  context: AdsManagementContext,
  id: string,
) => updateAdsCampaign(context, id, { status: 'ARCHIVED' })

const assertCampaignForCreativeWrite = async (
  context: AdsManagementContext,
  campaignId: string,
) => {
  await getAdsCampaign(context, campaignId)
}

export const listAdsCreativesForCampaign = async (
  context: AdsManagementContext,
  campaignId: string,
) => {
  await assertCampaignForCreativeWrite(context, campaignId)

  const result = await queryRows<AdCreativeRow>(
    `
      select
        id,
        campaign_id,
        society_id,
        slot_key,
        title,
        body,
        cta_label,
        image_url,
        destination_url,
        display_order,
        is_active,
        allow_dismiss,
        metadata,
        created_at::text,
        updated_at::text
      from public.ad_creatives
      where society_id = $1
        and campaign_id = $2
      order by display_order asc, created_at desc
    `,
    [context.societyId, campaignId],
  )

  return result.rows.map(mapCreative)
}

export const getAdsCreative = async (
  context: AdsManagementContext,
  id: string,
) => {
  const result = await queryRows<AdCreativeRow>(
    `
      select
        id,
        campaign_id,
        society_id,
        slot_key,
        title,
        body,
        cta_label,
        image_url,
        destination_url,
        display_order,
        is_active,
        allow_dismiss,
        metadata,
        created_at::text,
        updated_at::text
      from public.ad_creatives
      where society_id = $1
        and id = $2
      limit 1
    `,
    [context.societyId, id],
  )
  const creative = result.rows[0]

  if (!creative) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Ad creative was not found.',
    })
  }

  return mapCreative(creative)
}

export const createAdsCreative = async (
  context: AdsManagementContext,
  campaignId: string,
  input: z.infer<typeof adsCreativeCreateSchema>,
) => {
  await assertCampaignForCreativeWrite(context, campaignId)

  const result = await queryRows<AdCreativeRow>(
    `
      insert into public.ad_creatives (
        campaign_id,
        society_id,
        slot_key,
        title,
        body,
        cta_label,
        image_url,
        destination_url,
        display_order,
        is_active,
        allow_dismiss,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      returning
        id,
        campaign_id,
        society_id,
        slot_key,
        title,
        body,
        cta_label,
        image_url,
        destination_url,
        display_order,
        is_active,
        allow_dismiss,
        metadata,
        created_at::text,
        updated_at::text
    `,
    [
      campaignId,
      context.societyId,
      input.slotKey,
      input.title,
      input.body ?? null,
      input.ctaLabel ?? null,
      input.imageUrl,
      input.destinationUrl,
      input.displayOrder,
      input.isActive,
      input.allowDismiss,
      JSON.stringify(input.metadata ?? {}),
    ],
  )

  const creative = result.rows[0]

  if (!creative) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'Ad creative could not be created.',
    })
  }

  return mapCreative(creative)
}

export const updateAdsCreative = async (
  context: AdsManagementContext,
  id: string,
  input: z.infer<typeof adsCreativePatchSchema>,
) => {
  const values: unknown[] = [context.societyId, id]
  const updates: string[] = []
  const addUpdate = (column: string, value: unknown, cast = '') => {
    values.push(value)
    updates.push(`${column} = $${values.length}${cast}`)
  }

  if ('slotKey' in input) addUpdate('slot_key', input.slotKey)
  if ('title' in input) addUpdate('title', input.title)
  if ('body' in input) addUpdate('body', input.body ?? null)
  if ('ctaLabel' in input) addUpdate('cta_label', input.ctaLabel ?? null)
  if ('imageUrl' in input) addUpdate('image_url', input.imageUrl)
  if ('destinationUrl' in input) {
    addUpdate('destination_url', input.destinationUrl)
  }
  if ('displayOrder' in input) addUpdate('display_order', input.displayOrder)
  if ('isActive' in input) addUpdate('is_active', input.isActive)
  if ('allowDismiss' in input) addUpdate('allow_dismiss', input.allowDismiss)
  if ('metadata' in input) {
    addUpdate('metadata', JSON.stringify(input.metadata ?? {}), '::jsonb')
  }

  if (updates.length === 0) {
    return getAdsCreative(context, id)
  }

  const result = await queryRows<AdCreativeRow>(
    `
      update public.ad_creatives
      set ${updates.join(', ')}
      where society_id = $1
        and id = $2
      returning
        id,
        campaign_id,
        society_id,
        slot_key,
        title,
        body,
        cta_label,
        image_url,
        destination_url,
        display_order,
        is_active,
        allow_dismiss,
        metadata,
        created_at::text,
        updated_at::text
    `,
    values,
  )
  const creative = result.rows[0]

  if (!creative) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Ad creative was not found.',
    })
  }

  return mapCreative(creative)
}

export const archiveAdsCreative = async (
  context: AdsManagementContext,
  id: string,
) => updateAdsCreative(context, id, { isActive: false })

const parseRangeBoundary = (
  value: string | undefined,
  boundary: 'from' | 'to',
) => {
  if (!value) {
    return null
  }

  const normalized = value.trim()
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(normalized)

  if (dateOnly && boundary === 'from') {
    return `${normalized}T00:00:00.000Z`
  }

  if (dateOnly && boundary === 'to') {
    const date = new Date(`${normalized}T00:00:00.000Z`)
    date.setUTCDate(date.getUTCDate() + 1)
    return date.toISOString()
  }

  const date = new Date(normalized)

  if (Number.isNaN(date.getTime())) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Invalid ${boundary} date.`,
    })
  }

  return date.toISOString()
}

const addDateRangeFilters = (
  where: string[],
  values: unknown[],
  from?: string,
  to?: string,
) => {
  const fromValue = parseRangeBoundary(from, 'from')
  const toValue = parseRangeBoundary(to, 'to')

  if (fromValue) {
    values.push(fromValue)
    where.push(`e.occurred_at >= $${values.length}`)
  }

  if (toValue) {
    values.push(toValue)
    where.push(`e.occurred_at < $${values.length}`)
  }
}

const assertStatsTarget = async (
  context: AdsManagementContext,
  target: 'campaign' | 'creative',
  id: string,
) => {
  if (target === 'campaign') {
    await getAdsCampaign(context, id)
  } else {
    await getAdsCreative(context, id)
  }
}

export const getAdsStats = async (
  context: AdsManagementContext,
  target: 'campaign' | 'creative',
  id: string,
  query: z.infer<typeof adsStatsQuerySchema>,
): Promise<AdsStats> => {
  await assertStatsTarget(context, target, id)

  const values: unknown[] = [context.societyId, id]
  const where = [
    'e.society_id = $1',
    target === 'campaign' ? 'e.campaign_id = $2' : 'e.creative_id = $2',
  ]
  addDateRangeFilters(where, values, query.from, query.to)
  const whereSql = where.join(' and ')

  const [summaryResult, slotResult, dayResult] = await Promise.all([
    queryRows<StatsCountRow>(
      `
        select
          count(*) filter (where e.event_type = 'IMPRESSION')::text as impressions,
          count(distinct e.user_id) filter (where e.event_type = 'IMPRESSION')::text as unique_viewers,
          count(*) filter (where e.event_type = 'CLICK')::text as clicks,
          count(distinct e.user_id) filter (where e.event_type = 'CLICK')::text as unique_clickers,
          count(*) filter (where e.event_type = 'DISMISS')::text as dismissals
        from public.ad_events e
        where ${whereSql}
      `,
      values,
    ),
    queryRows<StatsSlotRow>(
      `
        select
          e.slot_key,
          count(*) filter (where e.event_type = 'IMPRESSION')::text as impressions,
          count(*) filter (where e.event_type = 'CLICK')::text as clicks,
          count(*) filter (where e.event_type = 'DISMISS')::text as dismissals
        from public.ad_events e
        where ${whereSql}
        group by e.slot_key
        order by e.slot_key asc
      `,
      values,
    ),
    queryRows<StatsDayRow>(
      `
        select
          date_trunc('day', e.occurred_at)::date::text as day,
          ''::text as slot_key,
          count(*) filter (where e.event_type = 'IMPRESSION')::text as impressions,
          count(*) filter (where e.event_type = 'CLICK')::text as clicks,
          count(*) filter (where e.event_type = 'DISMISS')::text as dismissals
        from public.ad_events e
        where ${whereSql}
        group by date_trunc('day', e.occurred_at)::date
        order by day asc
      `,
      values,
    ),
  ])

  const summary = summaryResult.rows[0]
  const impressions = Number(summary?.impressions ?? 0)
  const clicks = Number(summary?.clicks ?? 0)
  const stats: AdsStats = {
    impressions,
    uniqueViewers: Number(summary?.unique_viewers ?? 0),
    clicks,
    uniqueClickers: Number(summary?.unique_clickers ?? 0),
    dismissals: Number(summary?.dismissals ?? 0),
    ctr: toCtr(clicks, impressions),
    bySlot: slotResult.rows.map((row) => {
      const slotImpressions = Number(row.impressions)
      const slotClicks = Number(row.clicks)
      return {
        slotKey: row.slot_key,
        impressions: slotImpressions,
        clicks: slotClicks,
        dismissals: Number(row.dismissals),
        ctr: toCtr(slotClicks, slotImpressions),
      }
    }),
    byDay: dayResult.rows.map((row) => {
      const dayImpressions = Number(row.impressions)
      const dayClicks = Number(row.clicks)
      return {
        day: row.day,
        impressions: dayImpressions,
        clicks: dayClicks,
        dismissals: Number(row.dismissals),
        ctr: toCtr(dayClicks, dayImpressions),
      }
    }),
  }

  if (target === 'campaign') {
    stats.campaignId = id
  } else {
    stats.creativeId = id
  }

  return stats
}

export const listAdsEvents = async (
  context: AdsManagementContext,
  query: z.infer<typeof adsAdminEventsQuerySchema>,
) => {
  const values: unknown[] = [context.societyId]
  const where = ['e.society_id = $1']
  const addFilter = (sql: string, value: unknown) => {
    values.push(value)
    where.push(`${sql} $${values.length}`)
  }

  if (query.campaignId) addFilter('e.campaign_id =', query.campaignId)
  if (query.creativeId) addFilter('e.creative_id =', query.creativeId)
  if (query.eventType) addFilter('e.event_type =', query.eventType)
  if (query.userId) addFilter('e.user_id =', query.userId)
  if (query.flatId) addFilter('e.flat_id =', query.flatId)
  if (query.slotKey) addFilter('e.slot_key =', query.slotKey)
  addDateRangeFilters(where, values, query.from, query.to)

  const whereSql = where.join(' and ')
  const pageSize = query.pageSize
  const offset = (query.page - 1) * pageSize
  const [itemsResult, countResult] = await Promise.all([
    queryRows<{
      event_id: string
      event_type: AdEventType
      campaign_id: string
      creative_id: string
      user_id: string | null
      resident_name: string | null
      flat_id: string | null
      flat_label: string | null
      slot_key: string
      page_path: string | null
      occurred_at: string
    }>(
      `
        select
          e.id as event_id,
          e.event_type::text as event_type,
          e.campaign_id,
          e.creative_id,
          e.user_id,
          u.full_name as resident_name,
          e.flat_id,
          case
            when f.id is null then null
            else concat(b.name, ' ', f.flat_number)
          end as flat_label,
          e.slot_key,
          e.page_path,
          e.occurred_at::text
        from public.ad_events e
        left join public.users u on u.id = e.user_id
        left join public.flats f on f.id = e.flat_id
        left join public.blocks b on b.id = f.block_id
        where ${whereSql}
        order by e.occurred_at desc, e.id desc
        limit $${values.length + 1}
        offset $${values.length + 2}
      `,
      [...values, pageSize, offset],
    ),
    queryRows<{ total: string }>(
      `
        select count(*)::text as total
        from public.ad_events e
        where ${whereSql}
      `,
      values,
    ),
  ])

  const items: AdsAdminEventItem[] = itemsResult.rows.map((row) => ({
    eventId: row.event_id,
    eventType: row.event_type,
    campaignId: row.campaign_id,
    creativeId: row.creative_id,
    userId: row.user_id,
    residentName: row.resident_name,
    flatId: row.flat_id,
    flatLabel: row.flat_label,
    slotKey: row.slot_key,
    pagePath: row.page_path,
    occurredAt: row.occurred_at,
  }))

  return {
    items,
    total: Number(countResult.rows[0]?.total ?? 0),
    page: query.page,
    pageSize,
  }
}

export const assertResidentAdSlot = (value: unknown): ResidentAdSlotKey => {
  if (
    typeof value !== 'string' ||
    !RESIDENT_AD_SLOT_KEYS.includes(value as ResidentAdSlotKey)
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Invalid ad slot.',
    })
  }

  return value as ResidentAdSlotKey
}

export const getAdsApiProvisionSql = (token: string) => {
  const keyHash = hashAdsApiToken(token)

  return {
    keyHash,
    sql: `
insert into public.ad_api_keys (society_id, name, key_hash)
select id, 'Ads management key', '${keyHash}'
from public.society_profile
where code = '<SOCIETY_CODE>';
`.trim(),
  }
}
