import type {
  AdCampaignStatus,
  AdEventType,
  AdTargetingScope,
  ResidentAdSlotKey,
} from '~/shared/ads'

export type AdTargeting = {
  scope: AdTargetingScope
  blockIds?: string[] | undefined
  flatIds?: string[] | undefined
  userIds?: string[] | undefined
}

export type AdsAdminCampaign = {
  id: string
  societyId: string
  name: string
  description: string | null
  status: AdCampaignStatus
  startsAt: string | null
  endsAt: string | null
  priority: number
  targeting: AdTargeting
  frequencyCap: Record<string, unknown>
  createdByUserId: string | null
  updatedByUserId: string | null
  createdAt: string
  updatedAt: string
}

export type AdsAdminCreative = {
  id: string
  campaignId: string
  societyId: string
  slotKey: ResidentAdSlotKey
  title: string
  body: string | null
  ctaLabel: string | null
  imageUrl: string
  destinationUrl: string
  displayOrder: number
  isActive: boolean
  allowDismiss: boolean
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type ResidentAdItem = {
  campaignId: string
  creativeId: string
  slotKey: ResidentAdSlotKey
  title: string
  body: string | null
  ctaLabel: string | null
  imageUrl: string
  imageAlt: string
  sponsorLabel: string
  destinationUrl: string
  openMode: 'external-browser'
  allowDismiss: boolean
}

export type AdStatsBySlot = {
  slotKey: string
  impressions: number
  clicks: number
  dismissals: number
  ctr: number
}

export type AdsStats = {
  campaignId?: string
  creativeId?: string
  impressions: number
  uniqueViewers: number
  clicks: number
  uniqueClickers: number
  dismissals: number
  ctr: number
  bySlot: AdStatsBySlot[]
  byDay: Array<{
    day: string
    impressions: number
    clicks: number
    dismissals: number
    ctr: number
  }>
}

export type AdsAdminEventItem = {
  eventId: string
  eventType: AdEventType
  campaignId: string
  creativeId: string
  userId: string | null
  residentName: string | null
  flatId: string | null
  flatLabel: string | null
  slotKey: string
  pagePath: string | null
  occurredAt: string
}
