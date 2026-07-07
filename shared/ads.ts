export const RESIDENT_AD_SLOT_KEYS = [
  'resident-dues-top',
  'resident-dashboard-top',
  'resident-notices-inline',
  'resident-service-requests-top',
] as const

export type ResidentAdSlotKey = (typeof RESIDENT_AD_SLOT_KEYS)[number]

export const isResidentAdSlotKey = (
  value: unknown,
): value is ResidentAdSlotKey =>
  typeof value === 'string' &&
  RESIDENT_AD_SLOT_KEYS.includes(value as ResidentAdSlotKey)

export const AD_TARGETING_SCOPES = [
  'ALL_ACTIVE_RESIDENTS',
  'BLOCKS',
  'FLATS',
  'USERS',
  'OWNERS',
  'OWNER_OF_FLAT',
  'TENANTS',
  'DEFAULTERS',
  'BILLING_CONTACTS',
] as const

export type AdTargetingScope = (typeof AD_TARGETING_SCOPES)[number]

export const AD_EVENT_TYPES = ['IMPRESSION', 'CLICK', 'DISMISS'] as const

export type AdEventType = (typeof AD_EVENT_TYPES)[number]

export const AD_CAMPAIGN_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'ARCHIVED',
] as const

export type AdCampaignStatus = (typeof AD_CAMPAIGN_STATUSES)[number]
