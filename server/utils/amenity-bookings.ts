import type { H3Event } from 'h3'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { AppError } from './errors'
import { getDatabasePool } from './database'
import { parseListQuery } from './master-data'
import { queueAuditEvent } from './audit'
import {
  dispatchNotificationJobs,
  enqueueNotificationForUsers,
  resolveNotificationAudience,
  type NotificationChannel,
  type NotificationUser,
} from './notifications'
import type { AmenityBookingStatus } from '~/shared/amenity-bookings'
import type {
  AmenityAvailability,
  AmenityAvailabilityWindow,
  AmenityBlockedDates,
  AmenityBlackoutSummary,
  AmenityBookingDetail,
  AmenityBookingEvent,
  AmenityBookingRules,
  AmenityBookingSummary,
  AmenityOperatingHourWindow,
  AmenitySummary,
} from '~/types/domain'
import type { AuthMe } from '~/types/auth'

type BookingScope = 'admin' | 'resident'
type BackgroundWaitUntil = (promise: Promise<unknown>) => void

const immediateAmenityBookingNotificationLimit = 250
const residentInitiatedManagerNotificationChannels: NotificationChannel[] = [
  'PUSH',
  'EMAIL',
  'IN_APP',
]

type AmenityRow = {
  id: string
  society_id: string
  code: string
  name: string
  description: string | null
  location: string | null
  capacity: number | null
  is_active: boolean
  is_bookable: boolean
  requires_approval: boolean
  operating_hours: Record<string, AmenityOperatingHourWindow[]> | null
  booking_rules: AmenityBookingRules | null
  rules_text: string | null
  created_at: string
  updated_at: string
}

type BookingRow = {
  id: string
  society_id: string
  booking_number: string
  amenity_id: string
  amenity_name: string
  amenity_location: string | null
  requester_user_id: string
  requester_name: string
  requester_email: string | null
  requester_mobile_number: string | null
  flat_id: string
  flat_label: string
  block_name: string | null
  status: AmenityBookingStatus
  starts_at: string
  ends_at: string
  guest_count: number | null
  purpose: string
  resident_notes: string | null
  admin_notes: string | null
  decision_reason: string | null
  approved_by_user_id: string | null
  approved_by_name: string | null
  approved_at: string | null
  rejected_by_user_id: string | null
  rejected_by_name: string | null
  rejected_at: string | null
  cancelled_by_user_id: string | null
  cancelled_by_name: string | null
  cancelled_at: string | null
  completed_by_user_id: string | null
  completed_by_name: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

type BookingEventRow = {
  id: string
  booking_id: string
  event_type: AmenityBookingEvent['eventType']
  actor_user_id: string | null
  actor_name: string | null
  from_status: AmenityBookingStatus | null
  to_status: AmenityBookingStatus | null
  visibility: string
  message: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type BlackoutRow = {
  id: string
  society_id: string
  amenity_id: string
  amenity_name: string
  title: string
  starts_at: string
  ends_at: string
  reason: string | null
  created_by_user_id: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

type ConflictWindowRow = {
  id: string
  type: 'BOOKING' | 'BLACKOUT'
  title: string
  starts_at: string
  ends_at: string
  status: AmenityBookingStatus | null
}

const weekdays = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

const defaultOperatingHours: Record<string, AmenityOperatingHourWindow[]> = {
  monday: [{ start: '09:00', end: '22:00' }],
  tuesday: [{ start: '09:00', end: '22:00' }],
  wednesday: [{ start: '09:00', end: '22:00' }],
  thursday: [{ start: '09:00', end: '22:00' }],
  friday: [{ start: '09:00', end: '22:00' }],
  saturday: [{ start: '09:00', end: '23:00' }],
  sunday: [{ start: '09:00', end: '23:00' }],
}

const defaultRules: Required<AmenityBookingRules> = {
  minDurationMinutes: 60,
  maxDurationMinutes: 240,
  slotIntervalMinutes: 30,
  minimumLeadHours: 0,
  maximumAdvanceDays: 60,
  cancellationCutoffHours: 24,
}

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/

const operatingWindowSchema = z.object({
  start: z.string().regex(timePattern),
  end: z.string().regex(timePattern),
})

const operatingHoursSchema = z.record(
  z.string(),
  z.array(operatingWindowSchema),
)

const bookingRulesSchema = z.object({
  minDurationMinutes: z.coerce.number().int().positive().max(1440).optional(),
  maxDurationMinutes: z.coerce.number().int().positive().max(1440).optional(),
  slotIntervalMinutes: z.coerce.number().int().positive().max(240).optional(),
  minimumLeadHours: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 365)
    .optional(),
  maximumAdvanceDays: z.coerce.number().int().positive().max(365).optional(),
  cancellationCutoffHours: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 365)
    .optional(),
})

export const amenityUpsertSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((value) => value.toUpperCase().replace(/\s+/g, '_')),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600).nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  capacity: z.coerce.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
  isBookable: z.boolean().default(true),
  requiresApproval: z.boolean().default(true),
  operatingHours: operatingHoursSchema.default(defaultOperatingHours),
  bookingRules: bookingRulesSchema.default(defaultRules),
  rulesText: z.string().trim().max(2000).nullable().optional(),
})

const requiredUuidSchema = (requiredMessage: string, invalidMessage: string) =>
  z
    .string()
    .trim()
    .min(1, requiredMessage)
    .pipe(z.string().uuid(invalidMessage))

const requiredDateTimeSchema = (
  requiredMessage: string,
  invalidMessage: string,
) =>
  z
    .string()
    .trim()
    .min(1, requiredMessage)
    .pipe(z.string().datetime({ offset: true, message: invalidMessage }))

export const amenityBookingCreateSchema = z.object({
  amenityId: requiredUuidSchema(
    'Select an amenity.',
    'Select a valid amenity.',
  ),
  flatId: requiredUuidSchema('Select a flat.', 'Select a valid flat.'),
  startsAt: requiredDateTimeSchema(
    'Select a booking date and start time.',
    'Select a valid booking start time.',
  ),
  endsAt: requiredDateTimeSchema(
    'Select a booking date and end time.',
    'Select a valid booking end time.',
  ),
  guestCount: z.coerce.number().int().positive().nullable().optional(),
  purpose: z
    .string()
    .trim()
    .min(1, 'Enter a purpose.')
    .min(3, 'Purpose must be at least 3 characters.')
    .max(500),
  residentNotes: z.string().trim().max(2000).nullable().optional(),
  rulesAccepted: z.literal(true, {
    errorMap: () => ({
      message: 'Accept the society rules before submitting.',
    }),
  }),
})

export const amenityBookingApproveSchema = z.object({
  adminNotes: z.string().trim().max(2000).nullable().optional(),
})

export const amenityBookingRejectSchema = z.object({
  reason: z.string().trim().min(3).max(700),
})

export const amenityBookingCancelSchema = z.object({
  reason: z.string().trim().max(700).nullable().optional(),
})

export const amenityBlackoutCreateSchema = z.object({
  amenityId: z.string().uuid(),
  title: z.string().trim().min(3).max(160),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(700).nullable().optional(),
})

const mapAmenity = (row: AmenityRow): AmenitySummary => ({
  id: row.id,
  societyId: row.society_id,
  code: row.code,
  name: row.name,
  description: row.description,
  location: row.location,
  capacity: row.capacity,
  isActive: row.is_active,
  isBookable: row.is_bookable,
  requiresApproval: row.requires_approval,
  operatingHours: row.operating_hours ?? {},
  bookingRules: row.booking_rules ?? {},
  rulesText: row.rules_text,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapBooking = (row: BookingRow): AmenityBookingSummary => ({
  id: row.id,
  societyId: row.society_id,
  bookingNumber: row.booking_number,
  amenityId: row.amenity_id,
  amenityName: row.amenity_name,
  amenityLocation: row.amenity_location,
  requesterUserId: row.requester_user_id,
  requesterName: row.requester_name,
  requesterEmail: row.requester_email,
  requesterMobileNumber: row.requester_mobile_number,
  flatId: row.flat_id,
  flatLabel: row.flat_label,
  blockName: row.block_name,
  status: row.status,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  guestCount: row.guest_count,
  purpose: row.purpose,
  residentNotes: row.resident_notes,
  adminNotes: row.admin_notes,
  decisionReason: row.decision_reason,
  approvedByUserId: row.approved_by_user_id,
  approvedByName: row.approved_by_name,
  approvedAt: row.approved_at,
  rejectedByUserId: row.rejected_by_user_id,
  rejectedByName: row.rejected_by_name,
  rejectedAt: row.rejected_at,
  cancelledByUserId: row.cancelled_by_user_id,
  cancelledByName: row.cancelled_by_name,
  cancelledAt: row.cancelled_at,
  completedByUserId: row.completed_by_user_id,
  completedByName: row.completed_by_name,
  completedAt: row.completed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapEvent = (row: BookingEventRow): AmenityBookingEvent => ({
  id: row.id,
  bookingId: row.booking_id,
  eventType: row.event_type,
  actorUserId: row.actor_user_id,
  actorName: row.actor_name,
  fromStatus: row.from_status,
  toStatus: row.to_status,
  visibility: row.visibility,
  message: row.message,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
})

const mapBlackout = (row: BlackoutRow): AmenityBlackoutSummary => ({
  id: row.id,
  societyId: row.society_id,
  amenityId: row.amenity_id,
  amenityName: row.amenity_name,
  title: row.title,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  reason: row.reason,
  createdByUserId: row.created_by_user_id,
  createdByName: row.created_by_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const amenitySelectSql = `
  select
    id,
    society_id,
    code,
    name,
    description,
    location,
    capacity,
    is_active,
    is_bookable,
    requires_approval,
    operating_hours,
    booking_rules,
    rules_text,
    created_at::text,
    updated_at::text
  from amenities
`

const bookingSelectSql = `
  select
    booking.id,
    booking.society_id,
    booking.booking_number,
    booking.amenity_id,
    amenity.name as amenity_name,
    amenity.location as amenity_location,
    booking.requester_user_id,
    requester.full_name as requester_name,
    requester.email::text as requester_email,
    requester.mobile_number as requester_mobile_number,
    booking.flat_id,
    concat(block.name, ' ', flat.flat_number) as flat_label,
    block.name as block_name,
    booking.status::text as status,
    booking.starts_at::text,
    booking.ends_at::text,
    booking.guest_count,
    booking.purpose,
    booking.resident_notes,
    booking.admin_notes,
    booking.decision_reason,
    booking.approved_by_user_id,
    approver.full_name as approved_by_name,
    booking.approved_at::text,
    booking.rejected_by_user_id,
    rejecter.full_name as rejected_by_name,
    booking.rejected_at::text,
    booking.cancelled_by_user_id,
    canceller.full_name as cancelled_by_name,
    booking.cancelled_at::text,
    booking.completed_by_user_id,
    completer.full_name as completed_by_name,
    booking.completed_at::text,
    booking.created_at::text,
    booking.updated_at::text
  from amenity_bookings booking
  inner join amenities amenity on amenity.id = booking.amenity_id
  inner join users requester on requester.id = booking.requester_user_id
  inner join flats flat on flat.id = booking.flat_id
  inner join blocks block on block.id = flat.block_id
  left join users approver on approver.id = booking.approved_by_user_id
  left join users rejecter on rejecter.id = booking.rejected_by_user_id
  left join users canceller on canceller.id = booking.cancelled_by_user_id
  left join users completer on completer.id = booking.completed_by_user_id
`

const normalizeRules = (
  rules: AmenityBookingRules | null | undefined,
): Required<AmenityBookingRules> => ({
  ...defaultRules,
  ...(rules ?? {}),
})

const normalizeOperatingHours = (
  hours: Record<string, AmenityOperatingHourWindow[]> | null | undefined,
) => {
  const normalized =
    hours && Object.keys(hours).length > 0 ? hours : defaultOperatingHours
  return weekdays.reduce<Record<string, AmenityOperatingHourWindow[]>>(
    (acc, day) => {
      acc[day] = normalized[day] ?? []
      return acc
    },
    {},
  )
}

const toDate = (value: string, field: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `${field} must be a valid date and time.`,
    })
  }
  return date
}

const timeToMinutes = (value: string) => {
  const match = value.match(timePattern)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

const getLocalParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return {
    weekday: read('weekday').toLowerCase(),
    year: Number(read('year')),
    month: Number(read('month')),
    day: Number(read('day')),
    hour: Number(read('hour')),
    minute: Number(read('minute')),
    second: Number(read('second')),
  }
}

const getLocalMinutes = (date: Date, timeZone: string) => {
  const parts = getLocalParts(date, timeZone)
  return parts.hour * 60 + parts.minute
}

const getTimeZoneOffsetMinutes = (date: Date, timeZone: string) => {
  const parts = getLocalParts(date, timeZone)
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return (localAsUtc - date.getTime()) / 60000
}

const localDateTimeToUtc = (date: string, time: string, timeZone: string) => {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const [hour = 0, minute = 0] = time.split(':').map(Number)
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))

  for (let index = 0; index < 2; index += 1) {
    const offset = getTimeZoneOffsetMinutes(utc, timeZone)
    utc = new Date(
      Date.UTC(year, month - 1, day, hour, minute, 0) - offset * 60000,
    )
  }

  return utc
}

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const addDaysToDateKey = (date: string, days: number) => {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + days))
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

const eachDateKey = (startDate: string, endDate: string) => {
  const dates: string[] = []
  let current = startDate

  while (current <= endDate) {
    dates.push(current)
    current = addDaysToDateKey(current, 1)
  }

  return dates
}

const getSocietyTimezone = async (client: PoolClient, societyId: string) => {
  const result = await client.query<{ timezone: string }>(
    'select timezone from society_profile where id = $1 limit 1',
    [societyId],
  )
  return result.rows[0]?.timezone || 'Asia/Kolkata'
}

const assertResidentFlatAccess = async (
  client: PoolClient,
  authMe: AuthMe,
  flatId: string,
) => {
  if (authMe.flatAccess.some((flat) => flat.flatId === flatId)) {
    return
  }

  const result = await client.query<{ id: string }>(
    `
      select fr.id
      from flat_residents fr
      inner join flats f on f.id = fr.flat_id
      where fr.flat_id = $1
        and fr.user_id = $2
        and fr.is_active = true
        and f.society_id = $3
      limit 1
    `,
    [flatId, authMe.user.id, authMe.user.societyId],
  )

  if (!result.rows[0]) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'You cannot book an amenity for this flat.',
    })
  }
}

const getAmenityById = async (
  client: PoolClient,
  societyId: string,
  amenityId: string,
  options: { requireBookable?: boolean } = {},
) => {
  const result = await client.query<AmenityRow>(
    `
      ${amenitySelectSql}
      where id = $1 and society_id = $2
      limit 1
    `,
    [amenityId, societyId],
  )
  const amenity = result.rows[0]

  if (!amenity) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Amenity not found.',
    })
  }

  if (options.requireBookable && (!amenity.is_active || !amenity.is_bookable)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Choose an active bookable amenity.',
    })
  }

  return amenity
}

const listConflictWindows = async (
  client: PoolClient,
  amenityId: string,
  startsAt: Date,
  endsAt: Date,
  excludeBookingId?: string,
) => {
  const result = await client.query<ConflictWindowRow>(
    `
      select id, 'BOOKING'::text as type, booking_number as title, starts_at::text, ends_at::text, status::text
      from amenity_bookings
      where amenity_id = $1
        and status = 'APPROVED'
        and ($4::uuid is null or id <> $4::uuid)
        and tstzrange(starts_at, ends_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
      union all
      select id, 'BLACKOUT'::text as type, title, starts_at::text, ends_at::text, null::text as status
      from amenity_blackouts
      where amenity_id = $1
        and tstzrange(starts_at, ends_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
      order by starts_at asc
    `,
    [
      amenityId,
      startsAt.toISOString(),
      endsAt.toISOString(),
      excludeBookingId ?? null,
    ],
  )

  return result.rows
}

const assertNoConflicts = async (
  client: PoolClient,
  amenityId: string,
  startsAt: Date,
  endsAt: Date,
  excludeBookingId?: string,
) => {
  const conflicts = await listConflictWindows(
    client,
    amenityId,
    startsAt,
    endsAt,
    excludeBookingId,
  )

  if (conflicts.length > 0) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'This time overlaps an approved booking or blackout.',
      details: {
        conflicts: conflicts.map((conflict) => ({
          id: conflict.id,
          type: conflict.type,
          title: conflict.title,
          startsAt: conflict.starts_at,
          endsAt: conflict.ends_at,
          status: conflict.status,
        })),
      },
    })
  }
}

const validateBookingRules = async (
  client: PoolClient,
  amenity: AmenityRow,
  input: {
    startsAt: Date
    endsAt: Date
    guestCount?: number | null
  },
) => {
  const timezone = await getSocietyTimezone(client, amenity.society_id)
  const rules = normalizeRules(amenity.booking_rules)
  const operatingHours = normalizeOperatingHours(amenity.operating_hours)
  const durationMinutes =
    (input.endsAt.getTime() - input.startsAt.getTime()) / 60000

  if (durationMinutes <= 0) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'End time must be after start time.',
    })
  }

  if (
    durationMinutes < rules.minDurationMinutes ||
    durationMinutes > rules.maxDurationMinutes
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Booking duration must be between ${rules.minDurationMinutes} and ${rules.maxDurationMinutes} minutes.`,
    })
  }

  const startMinutes = getLocalMinutes(input.startsAt, timezone)
  const endMinutes = getLocalMinutes(input.endsAt, timezone)
  if (
    startMinutes % rules.slotIntervalMinutes !== 0 ||
    endMinutes % rules.slotIntervalMinutes !== 0
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Start and end time must align to ${rules.slotIntervalMinutes}-minute slots.`,
    })
  }

  const localStart = getLocalParts(input.startsAt, timezone)
  const dayWindows = operatingHours[localStart.weekday] ?? []
  const insideHours = dayWindows.some((window) => {
    const start = timeToMinutes(window.start)
    const end = timeToMinutes(window.end)
    return (
      start != null && end != null && startMinutes >= start && endMinutes <= end
    )
  })

  if (!insideHours) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Booking time must be inside amenity operating hours.',
    })
  }

  const now = Date.now()
  if (
    input.startsAt.getTime() <
    now + rules.minimumLeadHours * 60 * 60 * 1000
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        rules.minimumLeadHours === 0
          ? 'Booking start time must be current time or later.'
          : `Bookings require at least ${rules.minimumLeadHours} hours of lead time.`,
    })
  }

  if (
    input.startsAt.getTime() >
    now + rules.maximumAdvanceDays * 24 * 60 * 60 * 1000
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Bookings cannot be more than ${rules.maximumAdvanceDays} days in advance.`,
    })
  }

  if (
    amenity.capacity != null &&
    input.guestCount != null &&
    input.guestCount > amenity.capacity
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Guest count cannot exceed ${amenity.capacity}.`,
    })
  }
}

const addBookingEvent = async (
  client: PoolClient,
  input: {
    bookingId: string
    eventType: AmenityBookingEvent['eventType']
    actorUserId?: string | null
    fromStatus?: AmenityBookingStatus | null
    toStatus?: AmenityBookingStatus | null
    visibility?: 'RESIDENT_VISIBLE' | 'INTERNAL_NOTE' | 'SYSTEM'
    message?: string | null
    metadata?: Record<string, unknown>
  },
) => {
  await client.query(
    `
      insert into amenity_booking_events (
        booking_id,
        event_type,
        actor_user_id,
        from_status,
        to_status,
        visibility,
        message,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      input.bookingId,
      input.eventType,
      input.actorUserId ?? null,
      input.fromStatus ?? null,
      input.toStatus ?? null,
      input.visibility ?? 'RESIDENT_VISIBLE',
      input.message ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  )
}

const mergeNotificationUsers = (groups: NotificationUser[][]) => {
  const byId = new Map<string, NotificationUser>()

  for (const group of groups) {
    for (const user of group) {
      const existing = byId.get(user.id)
      byId.set(user.id, existing ? { ...existing, ...user } : user)
    }
  }

  return [...byId.values()]
}

const dispatchImmediateBookingNotifications = async (
  client: PoolClient,
  bookingId: string,
  eventId: string | null | undefined,
  options: { channel?: NotificationChannel; limit?: number } = {},
) => {
  if (!eventId) return

  try {
    const limit = options.limit ?? immediateAmenityBookingNotificationLimit
    let claimed = 0
    let sent = 0
    let failed = 0
    let retried = 0
    let skipped = 0

    do {
      const dispatchResult = await dispatchNotificationJobs(client, {
        eventId,
        limit,
        ...(options.channel ? { channel: options.channel } : {}),
        lockTimeoutMinutes: 1,
      })

      claimed = dispatchResult.claimed
      sent += dispatchResult.sent
      failed += dispatchResult.failed
      retried += dispatchResult.retried
      skipped += dispatchResult.skipped
    } while (claimed === limit)

    if (failed > 0 || retried > 0) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          message:
            'Amenity booking notification dispatch completed with failed jobs.',
          bookingId,
          eventId,
          sent,
          failed,
          retried,
          skipped,
        }),
      )
    }
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        message: 'Amenity booking notification dispatch failed.',
        bookingId,
        eventId,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

const warnBookingNotificationFailure = (
  bookingId: string,
  message: string,
  error: unknown,
) => {
  console.warn(
    JSON.stringify({
      level: 'warn',
      message,
      bookingId,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
}

const enqueueAndDispatchManagerNotification = async (
  client: PoolClient,
  bookingId: string,
  input: Parameters<typeof enqueueBookingManagerNotification>[2] = {},
) => {
  try {
    const managerNotification = await enqueueBookingManagerNotification(
      client,
      bookingId,
      {
        ...input,
        dispatchImmediately: false,
      },
    )

    if (managerNotification?.eventId && managerNotification.jobCount === 0) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          message: 'Amenity booking manager notification queued zero jobs.',
          bookingId,
          eventId: managerNotification.eventId,
          audienceCount: managerNotification.audienceCount,
          jobCount: managerNotification.jobCount,
        }),
      )
    }

    await dispatchImmediateBookingNotifications(
      client,
      bookingId,
      managerNotification?.eventId,
    )

    return managerNotification
  } catch (error) {
    warnBookingNotificationFailure(
      bookingId,
      'Amenity booking manager notification processing failed after booking update.',
      error,
    )
  }
}

const enqueueAndDispatchManagerNotificationWithFreshClient = async (
  bookingId: string,
  input: Parameters<typeof enqueueBookingManagerNotification>[2] = {},
) => {
  const client = await getDatabasePool().connect()

  try {
    await enqueueAndDispatchManagerNotification(client, bookingId, input)
  } finally {
    client.release()
  }
}

const enqueueAndDispatchManagerNotificationInBackground = (
  bookingId: string,
  input: Parameters<typeof enqueueBookingManagerNotification>[2] = {},
  waitUntil?: BackgroundWaitUntil,
) => {
  const promise = enqueueAndDispatchManagerNotificationWithFreshClient(
    bookingId,
    input,
  ).catch((error) => {
    warnBookingNotificationFailure(
      bookingId,
      'Amenity booking background notification processing failed.',
      error,
    )
  })

  if (waitUntil) {
    waitUntil(promise)
    return
  }

  void promise
}

const getBookingNotificationRow = async (
  client: PoolClient,
  bookingId: string,
) => {
  const result = await client.query<BookingRow>(
    `
      ${bookingSelectSql}
      where booking.id = $1
      limit 1
    `,
    [bookingId],
  )
  return result.rows[0] ?? null
}

const enqueueBookingResidentNotification = async (
  client: PoolClient,
  bookingId: string,
  input: {
    title: string
    body: string
    idempotencyKey: string
    triggeredByUserId?: string
    dispatchImmediately?: boolean
  },
) => {
  const booking = await getBookingNotificationRow(client, bookingId)
  if (!booking) return

  const users = mergeNotificationUsers([
    await resolveNotificationAudience(client, booking.society_id, {
      scope: 'OWNER_OF_FLAT',
      flatIds: [booking.flat_id],
    }),
    await resolveNotificationAudience(client, booking.society_id, {
      scope: 'USERS',
      userIds: [booking.requester_user_id],
    }),
  ]).filter((user) => user.id !== input.triggeredByUserId)

  if (users.length === 0) return

  const queued = await enqueueNotificationForUsers(client, {
    societyId: booking.society_id,
    eventKey: 'amenity_booking.updated',
    category: 'AMENITY_BOOKINGS',
    sourceTable: 'amenity_bookings',
    sourceId: booking.id,
    priority: 'MEDIUM',
    title: input.title,
    body: input.body,
    payload: {
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      amenityName: booking.amenity_name,
      flatLabel: booking.flat_label,
      status: booking.status,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      deepLinkUrl: `/my/amenity-bookings/${booking.id}`,
    },
    idempotencyKey: input.idempotencyKey,
    idempotencyWindowSeconds: 31536000,
    ...(input.triggeredByUserId
      ? { triggeredByUserId: input.triggeredByUserId }
      : {}),
    maxAttempts: 1,
    users,
    channels: ['PUSH', 'EMAIL', 'IN_APP'],
    audienceLabel: 'Booking resident recipients',
    audienceSnapshot: {
      eventKey: 'amenity_booking.updated',
      bookingId: booking.id,
      recipientScope: 'FLAT_OWNERS_AND_REQUESTER',
    },
  })

  if (input.dispatchImmediately !== false) {
    await dispatchImmediateBookingNotifications(
      client,
      bookingId,
      queued.eventId,
    )
  }

  return queued
}

const enqueueBookingManagerNotification = async (
  client: PoolClient,
  bookingId: string,
  input: {
    title?: string
    body?: string
    idempotencyKey?: string
    triggeredByUserId?: string
    dispatchImmediately?: boolean
    channels?: NotificationChannel[]
    maxAttempts?: number
    eventKey?: 'amenity_booking.created' | 'amenity_booking.updated'
  } = {},
) => {
  const booking = await getBookingNotificationRow(client, bookingId)
  if (!booking) return

  const managerResult = await client.query<{ id: string }>(
    `
      select id
      from users
      where society_id = $1
        and role in ('ADMIN', 'MANAGER')
        and is_active = true
        and can_login = true
        and deleted_at is null
        and (
          role = 'ADMIN'
          or cardinality(staff_permissions) = 0
          or 'amenity-bookings.manage' = any(staff_permissions)
        )
        and ($2::uuid is null or id <> $2::uuid)
      order by role asc, full_name asc
    `,
    [booking.society_id, input.triggeredByUserId ?? null],
  )
  const managerIds = managerResult.rows.map((row) => row.id)
  if (managerIds.length === 0) return

  const users = await resolveNotificationAudience(client, booking.society_id, {
    scope: 'USERS',
    userIds: managerIds,
  })
  const eventKey = input.eventKey ?? 'amenity_booking.created'

  const queued = await enqueueNotificationForUsers(client, {
    societyId: booking.society_id,
    eventKey,
    category: 'AMENITY_BOOKINGS',
    sourceTable: 'amenity_bookings',
    sourceId: booking.id,
    priority: 'MEDIUM',
    title: input.title ?? 'New amenity booking request',
    body:
      input.body ??
      `${booking.requester_name} requested ${booking.amenity_name} for ${booking.flat_label}.`,
    payload: {
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      amenityName: booking.amenity_name,
      flatLabel: booking.flat_label,
      status: booking.status,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      deepLinkUrl: `/admin/amenity-bookings/${booking.id}`,
      actionLabel: 'Review booking',
    },
    idempotencyKey:
      input.idempotencyKey ??
      `amenity_booking.manager:${booking.id}:${booking.status}`,
    idempotencyWindowSeconds: 31536000,
    ...(input.triggeredByUserId
      ? { triggeredByUserId: input.triggeredByUserId }
      : {}),
    maxAttempts: input.maxAttempts ?? 1,
    users,
    channels: input.channels ?? ['PUSH', 'EMAIL', 'IN_APP'],
    audienceLabel: 'Amenity booking admins and managers',
    audienceSnapshot: {
      eventKey,
      bookingId: booking.id,
      recipientScope: 'ADMIN_AND_MANAGER',
    },
  })

  if (input.dispatchImmediately !== false) {
    await dispatchImmediateBookingNotifications(
      client,
      bookingId,
      queued.eventId,
    )
  }

  return queued
}

type BookingNotificationBackgroundInput = {
  resident?: Parameters<typeof enqueueBookingResidentNotification>[2]
  manager?: Parameters<typeof enqueueBookingManagerNotification>[2]
}

const enqueueAndDispatchBookingUpdateNotificationsWithFreshClient = async (
  bookingId: string,
  input: BookingNotificationBackgroundInput,
) => {
  const client = await getDatabasePool().connect()

  try {
    const results = await Promise.allSettled([
      input.resident
        ? enqueueBookingResidentNotification(client, bookingId, {
            ...input.resident,
            dispatchImmediately: false,
          })
        : Promise.resolve(undefined),
      input.manager
        ? enqueueBookingManagerNotification(client, bookingId, {
            ...input.manager,
            dispatchImmediately: false,
          })
        : Promise.resolve(undefined),
    ])

    for (const result of results) {
      if (result.status === 'rejected') {
        warnBookingNotificationFailure(
          bookingId,
          'Amenity booking notification enqueue failed after booking update.',
          result.reason,
        )
        continue
      }

      await dispatchImmediateBookingNotifications(
        client,
        bookingId,
        result.value?.eventId,
      )
    }
  } finally {
    client.release()
  }
}

const enqueueAndDispatchBookingUpdateNotificationsInBackground = (
  bookingId: string,
  input: BookingNotificationBackgroundInput,
  waitUntil?: BackgroundWaitUntil,
) => {
  const promise = enqueueAndDispatchBookingUpdateNotificationsWithFreshClient(
    bookingId,
    input,
  ).catch((error) => {
    warnBookingNotificationFailure(
      bookingId,
      'Amenity booking background notification processing failed.',
      error,
    )
  })

  if (waitUntil) {
    waitUntil(promise)
    return
  }

  void promise
}

const queueBookingAudit = (
  event: H3Event,
  authMe: AuthMe,
  booking: Pick<AmenityBookingSummary, 'id' | 'bookingNumber' | 'flatId'>,
  action: 'CREATED' | 'UPDATED' | 'STATE_CHANGED',
  eventKey: string,
  metadata: Record<string, unknown> = {},
) => {
  queueAuditEvent(event, {
    module: 'MASTER',
    eventKey,
    action,
    severity: action === 'STATE_CHANGED' ? 'HIGH' : 'MEDIUM',
    actorUserId: authMe.user.id,
    actorAuthUserId: authMe.authUser.id,
    flatId: booking.flatId,
    metadata,
    relatedEntities: [
      { entityTable: 'society_profile', entityId: authMe.user.societyId },
      {
        entityTable: 'amenity_bookings',
        entityId: booking.id,
        entityLabel: booking.bookingNumber,
      },
    ],
  })
}

export const listAmenities = async (
  authMe: AuthMe,
  options: { residentOnly?: boolean } = {},
) => {
  const values: unknown[] = [authMe.user.societyId]
  const where = ['society_id = $1']

  if (options.residentOnly) {
    where.push('is_active = true', 'is_bookable = true')
  }

  const result = await getDatabasePool().query<AmenityRow>(
    `
      ${amenitySelectSql}
      where ${where.join(' and ')}
      order by name asc
    `,
    values,
  )

  return result.rows.map(mapAmenity)
}

export const getResidentAmenityOptions = async (authMe: AuthMe) => ({
  amenities: await listAmenities(authMe, { residentOnly: true }),
  flats: authMe.flatAccess.map((flat) => ({
    id: flat.flatId,
    label: `${flat.blockName} ${flat.flatNumber}`,
    relationshipType: flat.relationshipType,
  })),
})

export const upsertAmenity = async (
  authMe: AuthMe,
  input: z.infer<typeof amenityUpsertSchema>,
  amenityId?: string,
) => {
  const client = await getDatabasePool().connect()

  try {
    const result = amenityId
      ? await client.query<AmenityRow>(
          `
            update amenities
            set code = $3,
                name = $4,
                description = $5,
                location = $6,
                capacity = $7,
                is_active = $8,
                is_bookable = $9,
                requires_approval = $10,
                operating_hours = $11::jsonb,
                booking_rules = $12::jsonb,
                rules_text = $13
            where id = $1 and society_id = $2
            returning
              id,
              society_id,
              code,
              name,
              description,
              location,
              capacity,
              is_active,
              is_bookable,
              requires_approval,
              operating_hours,
              booking_rules,
              rules_text,
              created_at::text,
              updated_at::text
          `,
          [
            amenityId,
            authMe.user.societyId,
            input.code,
            input.name,
            input.description ?? null,
            input.location ?? null,
            input.capacity ?? null,
            input.isActive,
            input.isBookable,
            input.requiresApproval,
            JSON.stringify(input.operatingHours),
            JSON.stringify(input.bookingRules),
            input.rulesText ?? null,
          ],
        )
      : await client.query<AmenityRow>(
          `
            insert into amenities (
              society_id,
              code,
              name,
              description,
              location,
              capacity,
              is_active,
              is_bookable,
              requires_approval,
              operating_hours,
              booking_rules,
              rules_text
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12)
            returning
              id,
              society_id,
              code,
              name,
              description,
              location,
              capacity,
              is_active,
              is_bookable,
              requires_approval,
              operating_hours,
              booking_rules,
              rules_text,
              created_at::text,
              updated_at::text
          `,
          [
            authMe.user.societyId,
            input.code,
            input.name,
            input.description ?? null,
            input.location ?? null,
            input.capacity ?? null,
            input.isActive,
            input.isBookable,
            input.requiresApproval,
            JSON.stringify(input.operatingHours),
            JSON.stringify(input.bookingRules),
            input.rulesText ?? null,
          ],
        )

    const amenity = result.rows[0]
    if (!amenity) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: amenityId ? 404 : 500,
        message: amenityId ? 'Amenity not found.' : 'Amenity creation failed.',
      })
    }

    return mapAmenity(amenity)
  } finally {
    client.release()
  }
}

export const listAmenityBookings = async (
  event: H3Event,
  authMe: AuthMe,
  scope: BookingScope,
) => {
  const params = parseListQuery(event)
  const values: unknown[] = [authMe.user.societyId]
  const where = ['booking.society_id = $1']
  const filters = params.filters

  if (scope === 'resident') {
    const flatIds = authMe.flatAccess.map((flat) => flat.flatId)
    values.push(authMe.user.id)
    const requesterParam = values.length

    if (flatIds.length > 0) {
      values.push(flatIds)
      where.push(
        `(booking.requester_user_id = $${requesterParam} or booking.flat_id = any($${values.length}::uuid[]))`,
      )
    } else {
      where.push(`booking.requester_user_id = $${requesterParam}`)
    }
  }

  const simpleFilters: Record<string, string> = {
    status: 'booking.status::text',
    amenityId: 'booking.amenity_id',
    flatId: 'booking.flat_id',
  }

  for (const [key, column] of Object.entries(simpleFilters)) {
    const value = filters[key]?.[0]
    if (value) {
      values.push(value)
      where.push(`${column} = $${values.length}`)
    }
  }

  if (filters.dateFrom?.[0]) {
    values.push(filters.dateFrom[0])
    where.push(`booking.starts_at >= $${values.length}::timestamptz`)
  }

  if (filters.dateTo?.[0]) {
    values.push(filters.dateTo[0])
    where.push(`booking.starts_at <= $${values.length}::timestamptz`)
  }

  if (params.search) {
    values.push(`%${params.search}%`)
    where.push(`(
      booking.booking_number ilike $${values.length}
      or amenity.name ilike $${values.length}
      or requester.full_name ilike $${values.length}
      or requester.mobile_number ilike $${values.length}
      or concat(block.name, ' ', flat.flat_number) ilike $${values.length}
    )`)
  }

  const sortColumns: Record<string, string> = {
    bookingNumber: 'booking.booking_number',
    amenityName: 'amenity.name',
    status: 'booking.status',
    startsAt: 'booking.starts_at',
    createdAt: 'booking.created_at',
  }
  const sortBy = sortColumns[params.sortBy ?? 'startsAt'] ?? 'booking.starts_at'
  const sortDirection = params.sortDirection === 'asc' ? 'asc' : 'desc'
  const offset = (params.page - 1) * params.pageSize

  const [itemsResult, countResult] = await Promise.all([
    getDatabasePool().query<BookingRow>(
      `
        ${bookingSelectSql}
        where ${where.join(' and ')}
        order by ${sortBy} ${sortDirection}
        limit $${values.length + 1}
        offset $${values.length + 2}
      `,
      [...values, params.pageSize, offset],
    ),
    getDatabasePool().query<{ count: string }>(
      `
        select count(*)::text as count
        from amenity_bookings booking
        inner join amenities amenity on amenity.id = booking.amenity_id
        inner join users requester on requester.id = booking.requester_user_id
        inner join flats flat on flat.id = booking.flat_id
        inner join blocks block on block.id = flat.block_id
        where ${where.join(' and ')}
      `,
      values,
    ),
  ])

  return {
    items: itemsResult.rows.map(mapBooking),
    total: Number(countResult.rows[0]?.count ?? 0),
    params,
  }
}

export const getAmenityBookingDetail = async (
  authMe: AuthMe,
  bookingId: string,
  scope: BookingScope,
  options: { dbClient?: PoolClient } = {},
) => {
  const values: unknown[] = [bookingId, authMe.user.societyId]
  const where = ['booking.id = $1', 'booking.society_id = $2']

  if (scope === 'resident') {
    const flatIds = authMe.flatAccess.map((flat) => flat.flatId)
    values.push(authMe.user.id)
    const requesterParam = values.length

    if (flatIds.length > 0) {
      values.push(flatIds)
      where.push(
        `(booking.requester_user_id = $${requesterParam} or booking.flat_id = any($${values.length}::uuid[]))`,
      )
    } else {
      where.push(`booking.requester_user_id = $${requesterParam}`)
    }
  }

  const client = options.dbClient ?? (await getDatabasePool().connect())
  const shouldReleaseClient = !options.dbClient
  try {
    const bookingResult = await client.query<BookingRow>(
      `
        ${bookingSelectSql}
        where ${where.join(' and ')}
        limit 1
      `,
      values,
    )
    const booking = bookingResult.rows[0]

    if (!booking) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Booking not found.',
      })
    }

    const [amenityResult, eventsResult] = await Promise.all([
      client.query<AmenityRow>(
        `
          ${amenitySelectSql}
          where id = $1 and society_id = $2
          limit 1
        `,
        [booking.amenity_id, authMe.user.societyId],
      ),
      client.query<BookingEventRow>(
        `
          select
            event.id,
            event.booking_id,
            event.event_type::text,
            event.actor_user_id,
            actor.full_name as actor_name,
            event.from_status::text,
            event.to_status::text,
            event.visibility,
            event.message,
            event.metadata,
            event.created_at::text
          from amenity_booking_events event
          left join users actor on actor.id = event.actor_user_id
          where event.booking_id = $1
            and ($2::text = 'admin' or event.visibility <> 'INTERNAL_NOTE')
          order by event.created_at asc
        `,
        [booking.id, scope],
      ),
    ])

    const amenity = amenityResult.rows[0]
    if (!amenity) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Amenity not found.',
      })
    }

    return {
      ...mapBooking(booking),
      amenity: mapAmenity(amenity),
      events: eventsResult.rows.map(mapEvent),
    } satisfies AmenityBookingDetail
  } finally {
    if (shouldReleaseClient) {
      client.release()
    }
  }
}

export const createAmenityBooking = async (
  event: H3Event,
  authMe: AuthMe,
  input: z.infer<typeof amenityBookingCreateSchema>,
) => {
  const client = await getDatabasePool().connect()
  let committed = false

  try {
    await client.query('begin')
    await assertResidentFlatAccess(client, authMe, input.flatId)

    const amenity = await getAmenityById(
      client,
      authMe.user.societyId,
      input.amenityId,
      {
        requireBookable: true,
      },
    )
    const startsAt = toDate(input.startsAt, 'Start time')
    const endsAt = toDate(input.endsAt, 'End time')

    await validateBookingRules(client, amenity, {
      startsAt,
      endsAt,
      guestCount: input.guestCount ?? null,
    })
    await assertNoConflicts(client, amenity.id, startsAt, endsAt)

    const year = new Date().getFullYear()
    const sequence = await client.query<{ value: string }>(
      `select next_yearly_sequence('AMENITY_BOOKING', $1)::text as value`,
      [year],
    )
    const bookingNumber = `AB-${year}-${String(sequence.rows[0]?.value ?? '1').padStart(5, '0')}`
    const inserted = await client.query<{ id: string }>(
      `
        insert into amenity_bookings (
          society_id,
          booking_number,
          amenity_id,
          requester_user_id,
          flat_id,
          status,
          starts_at,
          ends_at,
          guest_count,
          purpose,
          resident_notes
        )
        values ($1, $2, $3, $4, $5, 'REQUESTED', $6, $7, $8, $9, $10)
        returning id
      `,
      [
        authMe.user.societyId,
        bookingNumber,
        amenity.id,
        authMe.user.id,
        input.flatId,
        startsAt.toISOString(),
        endsAt.toISOString(),
        input.guestCount ?? null,
        input.purpose,
        input.residentNotes ?? null,
      ],
    )
    const bookingId = inserted.rows[0]?.id
    if (!bookingId) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Booking creation failed.',
      })
    }

    await addBookingEvent(client, {
      bookingId,
      eventType: 'CREATED',
      actorUserId: authMe.user.id,
      toStatus: 'REQUESTED',
      message: 'Booking request submitted.',
    })
    await client.query('commit')
    committed = true

    const booking = await getAmenityBookingDetail(
      authMe,
      bookingId,
      'resident',
      { dbClient: client },
    )
    queueBookingAudit(
      event,
      authMe,
      booking,
      'CREATED',
      'amenity_booking.created',
    )
    enqueueAndDispatchBookingUpdateNotificationsInBackground(
      bookingId,
      {
        resident: {
          title: 'Amenity booking submitted',
          body: `${booking.bookingNumber} for ${booking.amenityName} has been submitted.`,
          idempotencyKey: `amenity_booking.resident.created:${bookingId}`,
          triggeredByUserId: authMe.user.id,
        },
        manager: {
          triggeredByUserId: authMe.user.id,
          idempotencyKey: `amenity_booking.manager.created:${bookingId}`,
          channels: residentInitiatedManagerNotificationChannels,
          maxAttempts: 1,
        },
      },
      event.waitUntil?.bind(event),
    )

    return booking
  } catch (error) {
    if (!committed) {
      await client.query('rollback')
      translateAmenityBookingWriteError(error)
    }
    throw error
  } finally {
    client.release()
  }
}

const getBookingForUpdate = async (
  client: PoolClient,
  authMe: AuthMe,
  bookingId: string,
) => {
  const result = await client.query<BookingRow>(
    `
      ${bookingSelectSql}
      where booking.id = $1 and booking.society_id = $2
      for update of booking
    `,
    [bookingId, authMe.user.societyId],
  )
  const booking = result.rows[0]

  if (!booking) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Booking not found.',
    })
  }

  return booking
}

const isPgError = (
  error: unknown,
): error is { code?: string; constraint?: string; message?: string } =>
  Boolean(error && typeof error === 'object')

const translateConflictError = (error: unknown) => {
  const pgError = isPgError(error) ? error : {}
  if (
    pgError.code === '23P01' ||
    pgError.constraint === 'amenity_bookings_no_approved_overlap' ||
    pgError.message?.includes('overlaps approved booking') ||
    pgError.message?.includes('overlaps blackout')
  ) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'This time overlaps an approved booking or blackout.',
    })
  }

  throw error
}

const translateAmenityBookingWriteError = (error: unknown) => {
  if (error instanceof AppError) {
    throw error
  }

  const pgError = isPgError(error) ? error : {}
  if (
    pgError.code === '23P01' ||
    pgError.constraint === 'amenity_bookings_no_approved_overlap' ||
    pgError.message?.includes('overlaps approved booking') ||
    pgError.message?.includes('overlaps blackout')
  ) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'This time overlaps an approved booking or blackout.',
    })
  }

  if (
    pgError.message?.includes('amenity must belong to booking society') ||
    pgError.message?.includes('flat must belong to booking society') ||
    pgError.message?.includes('requester must belong to booking society') ||
    pgError.code === '23503'
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'Selected amenity or flat is no longer available. Refresh and try again.',
    })
  }

  if (pgError.code === '23514') {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'Booking details failed validation. Check the time and guest count, then try again.',
    })
  }

  if (
    pgError.code === '23505' &&
    pgError.constraint?.includes('booking_number')
  ) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'Booking number was already used. Please submit again.',
    })
  }

  throw error
}

export const approveAmenityBooking = async (
  event: H3Event,
  authMe: AuthMe,
  bookingId: string,
  input: z.infer<typeof amenityBookingApproveSchema>,
) => {
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const booking = await getBookingForUpdate(client, authMe, bookingId)

    if (booking.status !== 'REQUESTED') {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Only requested bookings can be approved.',
      })
    }

    const amenity = await getAmenityById(
      client,
      authMe.user.societyId,
      booking.amenity_id,
    )
    const startsAt = toDate(booking.starts_at, 'Start time')
    const endsAt = toDate(booking.ends_at, 'End time')

    await validateBookingRules(client, amenity, {
      startsAt,
      endsAt,
      guestCount: booking.guest_count,
    })
    await assertNoConflicts(client, amenity.id, startsAt, endsAt, booking.id)

    try {
      await client.query(
        `
          update amenity_bookings
          set status = 'APPROVED',
              admin_notes = coalesce($3, admin_notes),
              approved_by_user_id = $2,
              approved_at = now(),
              decision_reason = null
          where id = $1
        `,
        [booking.id, authMe.user.id, input.adminNotes ?? null],
      )
    } catch (error) {
      translateConflictError(error)
    }

    await addBookingEvent(client, {
      bookingId: booking.id,
      eventType: 'APPROVED',
      actorUserId: authMe.user.id,
      fromStatus: booking.status,
      toStatus: 'APPROVED',
      message: input.adminNotes || 'Booking approved.',
    })
    await client.query('commit')
    enqueueAndDispatchBookingUpdateNotificationsInBackground(
      booking.id,
      {
        resident: {
          title: 'Amenity booking approved',
          body: `${booking.booking_number} for ${booking.amenity_name} has been approved.`,
          idempotencyKey: `amenity_booking.resident.approved:${booking.id}`,
          triggeredByUserId: authMe.user.id,
        },
        manager: {
          title: 'Amenity booking approved',
          body: `${authMe.user.fullName} approved ${booking.booking_number} for ${booking.amenity_name}.`,
          idempotencyKey: `amenity_booking.manager.approved:${booking.id}`,
          triggeredByUserId: authMe.user.id,
          eventKey: 'amenity_booking.updated',
        },
      },
      event.waitUntil?.bind(event),
    )

    const updated = await getAmenityBookingDetail(authMe, booking.id, 'admin', {
      dbClient: client,
    })
    queueBookingAudit(
      event,
      authMe,
      updated,
      'STATE_CHANGED',
      'amenity_booking.approved',
      {
        fromStatus: booking.status,
        toStatus: 'APPROVED',
      },
    )

    return updated
  } catch (error) {
    await client.query('rollback')
    if ((error as { code?: string }).code === '23P01') {
      translateConflictError(error)
    }
    throw error
  } finally {
    client.release()
  }
}

export const rejectAmenityBooking = async (
  event: H3Event,
  authMe: AuthMe,
  bookingId: string,
  input: z.infer<typeof amenityBookingRejectSchema>,
) => {
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const booking = await getBookingForUpdate(client, authMe, bookingId)

    if (booking.status !== 'REQUESTED') {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Only requested bookings can be rejected.',
      })
    }

    await client.query(
      `
        update amenity_bookings
        set status = 'REJECTED',
            rejected_by_user_id = $2,
            rejected_at = now(),
            decision_reason = $3
        where id = $1
      `,
      [booking.id, authMe.user.id, input.reason],
    )
    await addBookingEvent(client, {
      bookingId: booking.id,
      eventType: 'REJECTED',
      actorUserId: authMe.user.id,
      fromStatus: booking.status,
      toStatus: 'REJECTED',
      message: input.reason,
    })
    await client.query('commit')
    enqueueAndDispatchBookingUpdateNotificationsInBackground(
      booking.id,
      {
        resident: {
          title: 'Amenity booking rejected',
          body: `${booking.booking_number} for ${booking.amenity_name} was rejected: ${input.reason}`,
          idempotencyKey: `amenity_booking.resident.rejected:${booking.id}`,
          triggeredByUserId: authMe.user.id,
        },
        manager: {
          title: 'Amenity booking rejected',
          body: `${authMe.user.fullName} rejected ${booking.booking_number} for ${booking.amenity_name}.`,
          idempotencyKey: `amenity_booking.manager.rejected:${booking.id}`,
          triggeredByUserId: authMe.user.id,
          eventKey: 'amenity_booking.updated',
        },
      },
      event.waitUntil?.bind(event),
    )

    const updated = await getAmenityBookingDetail(authMe, booking.id, 'admin', {
      dbClient: client,
    })
    queueBookingAudit(
      event,
      authMe,
      updated,
      'STATE_CHANGED',
      'amenity_booking.rejected',
      {
        fromStatus: booking.status,
        toStatus: 'REJECTED',
      },
    )

    return updated
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const cancelAmenityBooking = async (
  event: H3Event,
  authMe: AuthMe,
  bookingId: string,
  input: z.infer<typeof amenityBookingCancelSchema>,
  scope: BookingScope,
) => {
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const booking = await getBookingForUpdate(client, authMe, bookingId)

    if (scope === 'resident') {
      await assertResidentFlatAccess(client, authMe, booking.flat_id)
    }

    if (!['REQUESTED', 'APPROVED'].includes(booking.status)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Only requested or approved bookings can be cancelled.',
      })
    }

    if (scope === 'resident') {
      const amenity = await getAmenityById(
        client,
        authMe.user.societyId,
        booking.amenity_id,
      )
      const rules = normalizeRules(amenity.booking_rules)
      const startsAt = toDate(booking.starts_at, 'Start time')

      if (
        startsAt.getTime() <
        Date.now() + rules.cancellationCutoffHours * 60 * 60 * 1000
      ) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: `Bookings can be cancelled until ${rules.cancellationCutoffHours} hours before start time.`,
        })
      }
    }

    const reason =
      input.reason?.trim() ||
      (scope === 'resident' ? 'Cancelled by resident.' : 'Cancelled by admin.')
    await client.query(
      `
        update amenity_bookings
        set status = 'CANCELLED',
            cancelled_by_user_id = $2,
            cancelled_at = now(),
            decision_reason = $3
        where id = $1
      `,
      [booking.id, authMe.user.id, reason],
    )
    await addBookingEvent(client, {
      bookingId: booking.id,
      eventType: 'CANCELLED',
      actorUserId: authMe.user.id,
      fromStatus: booking.status,
      toStatus: 'CANCELLED',
      message: reason,
    })

    const managerNotificationInput =
      scope === 'resident'
        ? ({
            title: 'Amenity booking cancelled',
            body: `${booking.booking_number} for ${booking.amenity_name} was cancelled by ${authMe.user.fullName}.`,
            idempotencyKey: `amenity_booking.manager.cancelled:${booking.id}`,
            triggeredByUserId: authMe.user.id,
            dispatchImmediately: false,
            channels: residentInitiatedManagerNotificationChannels,
            maxAttempts: 1,
            eventKey: 'amenity_booking.updated',
          } satisfies Parameters<typeof enqueueBookingManagerNotification>[2])
        : ({
            title: 'Amenity booking cancelled',
            body: `${authMe.user.fullName} cancelled ${booking.booking_number} for ${booking.amenity_name}.`,
            idempotencyKey: `amenity_booking.manager.cancelled:${booking.id}`,
            triggeredByUserId: authMe.user.id,
            dispatchImmediately: false,
            eventKey: 'amenity_booking.updated',
          } satisfies Parameters<typeof enqueueBookingManagerNotification>[2])

    await client.query('commit')
    if (scope === 'resident') {
      enqueueAndDispatchManagerNotificationInBackground(
        booking.id,
        managerNotificationInput,
        event.waitUntil?.bind(event),
      )
    } else {
      enqueueAndDispatchBookingUpdateNotificationsInBackground(
        booking.id,
        {
          resident: {
            title: 'Amenity booking cancelled',
            body: `${booking.booking_number} for ${booking.amenity_name} was cancelled: ${reason}`,
            idempotencyKey: `amenity_booking.resident.cancelled:${booking.id}`,
            triggeredByUserId: authMe.user.id,
          },
          manager: managerNotificationInput,
        },
        event.waitUntil?.bind(event),
      )
    }

    const updated = await getAmenityBookingDetail(authMe, booking.id, scope, {
      dbClient: client,
    })
    queueBookingAudit(
      event,
      authMe,
      updated,
      'STATE_CHANGED',
      'amenity_booking.cancelled',
      {
        fromStatus: booking.status,
        toStatus: 'CANCELLED',
        scope,
      },
    )

    return updated
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const completeAmenityBooking = async (
  event: H3Event,
  authMe: AuthMe,
  bookingId: string,
) => {
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const booking = await getBookingForUpdate(client, authMe, bookingId)

    if (booking.status !== 'APPROVED') {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Only approved bookings can be completed.',
      })
    }

    await client.query(
      `
        update amenity_bookings
        set status = 'COMPLETED',
            completed_by_user_id = $2,
            completed_at = now()
        where id = $1
      `,
      [booking.id, authMe.user.id],
    )
    await addBookingEvent(client, {
      bookingId: booking.id,
      eventType: 'COMPLETED',
      actorUserId: authMe.user.id,
      fromStatus: booking.status,
      toStatus: 'COMPLETED',
      message: 'Booking marked completed.',
    })
    await client.query('commit')
    enqueueAndDispatchBookingUpdateNotificationsInBackground(
      booking.id,
      {
        resident: {
          title: 'Amenity booking completed',
          body: `${booking.booking_number} for ${booking.amenity_name} was marked completed.`,
          idempotencyKey: `amenity_booking.resident.completed:${booking.id}`,
          triggeredByUserId: authMe.user.id,
        },
        manager: {
          title: 'Amenity booking completed',
          body: `${authMe.user.fullName} marked ${booking.booking_number} for ${booking.amenity_name} completed.`,
          idempotencyKey: `amenity_booking.manager.completed:${booking.id}`,
          triggeredByUserId: authMe.user.id,
          eventKey: 'amenity_booking.updated',
        },
      },
      event.waitUntil?.bind(event),
    )

    const updated = await getAmenityBookingDetail(authMe, booking.id, 'admin', {
      dbClient: client,
    })
    queueBookingAudit(
      event,
      authMe,
      updated,
      'STATE_CHANGED',
      'amenity_booking.completed',
      {
        fromStatus: booking.status,
        toStatus: 'COMPLETED',
      },
    )

    return updated
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const getAmenityAvailability = async (
  authMe: AuthMe,
  amenityId: string,
  dateInput: unknown,
) => {
  const date = dateOnlySchema.parse(String(dateInput ?? ''))
  const client = await getDatabasePool().connect()

  try {
    const amenity = await getAmenityById(
      client,
      authMe.user.societyId,
      amenityId,
      {
        requireBookable: authMe.user.role === 'RESIDENT',
      },
    )
    const timezone = await getSocietyTimezone(client, authMe.user.societyId)
    const operatingHours = normalizeOperatingHours(amenity.operating_hours)
    const dayStart = localDateTimeToUtc(date, '00:00', timezone)
    const dayEnd = localDateTimeToUtc(
      addDaysToDateKey(date, 1),
      '00:00',
      timezone,
    )

    const windowsResult = await client.query<ConflictWindowRow>(
      `
        select id, 'BOOKING'::text as type, booking_number as title, starts_at::text, ends_at::text, status::text
        from amenity_bookings
        where amenity_id = $1
          and status = 'APPROVED'
          and tstzrange(starts_at, ends_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
        union all
        select id, 'BLACKOUT'::text as type, title, starts_at::text, ends_at::text, null::text as status
        from amenity_blackouts
        where amenity_id = $1
          and tstzrange(starts_at, ends_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
        order by starts_at asc
      `,
      [amenityId, dayStart.toISOString(), dayEnd.toISOString()],
    )

    const unavailableWindows: AmenityAvailabilityWindow[] =
      windowsResult.rows.map((window) => ({
        id: window.id,
        type: window.type,
        title: window.title,
        startsAt: window.starts_at,
        endsAt: window.ends_at,
        ...(window.status ? { status: window.status } : {}),
      }))

    const rules = normalizeRules(amenity.booking_rules)
    const weekday =
      weekdays[localDateTimeToUtc(date, '12:00', timezone).getDay()] ?? 'sunday'
    const suggestions: AmenityAvailability['availableSlotSuggestions'] = []
    const earliestStart = Date.now() + rules.minimumLeadHours * 60 * 60 * 1000
    const latestStart =
      Date.now() + rules.maximumAdvanceDays * 24 * 60 * 60 * 1000

    for (const window of operatingHours[weekday] ?? []) {
      const start = timeToMinutes(window.start)
      const end = timeToMinutes(window.end)

      if (start == null || end == null) continue

      for (
        let minutes = start;
        minutes + rules.minDurationMinutes <= end;
        minutes += rules.slotIntervalMinutes
      ) {
        const startsAt = localDateTimeToUtc(
          date,
          `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
          timezone,
        )
        const endsAt = new Date(
          startsAt.getTime() + rules.minDurationMinutes * 60 * 1000,
        )
        const overlaps = unavailableWindows.some(
          (unavailable) =>
            startsAt < new Date(unavailable.endsAt) &&
            endsAt > new Date(unavailable.startsAt),
        )

        if (
          !overlaps &&
          startsAt.getTime() >= earliestStart &&
          startsAt.getTime() <= latestStart
        ) {
          suggestions.push({
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
          })
        }

        if (suggestions.length >= 8) break
      }

      if (suggestions.length >= 8) break
    }

    return {
      amenity: mapAmenity(amenity),
      date,
      operatingHours,
      unavailableWindows,
      availableSlotSuggestions: suggestions,
    } satisfies AmenityAvailability
  } finally {
    client.release()
  }
}

export const getAmenityBlockedDates = async (
  authMe: AuthMe,
  amenityId: string,
  startDateInput: unknown,
  endDateInput: unknown,
) => {
  const startDate = dateOnlySchema.parse(String(startDateInput ?? ''))
  const endDate = dateOnlySchema.parse(String(endDateInput ?? ''))

  if (endDate < startDate) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'End date must be after start date.',
    })
  }

  const dates = eachDateKey(startDate, endDate)
  if (dates.length > 370) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Date range cannot exceed 370 days.',
    })
  }

  const client = await getDatabasePool().connect()

  try {
    const amenity = await getAmenityById(
      client,
      authMe.user.societyId,
      amenityId,
      {
        requireBookable: authMe.user.role === 'RESIDENT',
      },
    )
    const timezone = await getSocietyTimezone(client, authMe.user.societyId)
    const operatingHours = normalizeOperatingHours(amenity.operating_hours)
    const rules = normalizeRules(amenity.booking_rules)
    const rangeStart = localDateTimeToUtc(startDate, '00:00', timezone)
    const rangeEnd = localDateTimeToUtc(
      addDaysToDateKey(endDate, 1),
      '00:00',
      timezone,
    )
    const windows = await listConflictWindows(
      client,
      amenityId,
      rangeStart,
      rangeEnd,
    )
    const earliestStart = Date.now() + rules.minimumLeadHours * 60 * 60 * 1000
    const latestStart =
      Date.now() + rules.maximumAdvanceDays * 24 * 60 * 60 * 1000

    const hasAvailableSlot = (date: string) => {
      const weekday =
        weekdays[localDateTimeToUtc(date, '12:00', timezone).getDay()] ??
        'sunday'

      for (const window of operatingHours[weekday] ?? []) {
        const start = timeToMinutes(window.start)
        const end = timeToMinutes(window.end)
        if (start == null || end == null) continue

        for (
          let minutes = start;
          minutes + rules.minDurationMinutes <= end;
          minutes += rules.slotIntervalMinutes
        ) {
          const startsAt = localDateTimeToUtc(
            date,
            `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
            timezone,
          )
          const endsAt = new Date(
            startsAt.getTime() + rules.minDurationMinutes * 60 * 1000,
          )

          if (
            startsAt.getTime() < earliestStart ||
            startsAt.getTime() > latestStart
          ) {
            continue
          }

          const overlaps = windows.some(
            (unavailable) =>
              startsAt < new Date(unavailable.ends_at) &&
              endsAt > new Date(unavailable.starts_at),
          )

          if (!overlaps) {
            return true
          }
        }
      }

      return false
    }

    return {
      amenity: mapAmenity(amenity),
      startDate,
      endDate,
      blockedDates: dates.filter((date) => !hasAvailableSlot(date)),
    } satisfies AmenityBlockedDates
  } finally {
    client.release()
  }
}

export const createAmenityBlackout = async (
  event: H3Event,
  authMe: AuthMe,
  input: z.infer<typeof amenityBlackoutCreateSchema>,
) => {
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    await getAmenityById(client, authMe.user.societyId, input.amenityId)
    const startsAt = toDate(input.startsAt, 'Start time')
    const endsAt = toDate(input.endsAt, 'End time')

    if (endsAt <= startsAt) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'End time must be after start time.',
      })
    }

    await assertNoConflicts(client, input.amenityId, startsAt, endsAt)

    const inserted = await client.query<BlackoutRow>(
      `
        insert into amenity_blackouts (
          society_id,
          amenity_id,
          title,
          starts_at,
          ends_at,
          reason,
          created_by_user_id
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning
          id,
          society_id,
          amenity_id,
          (select name from amenities where id = amenity_id) as amenity_name,
          title,
          starts_at::text,
          ends_at::text,
          reason,
          created_by_user_id,
          (select full_name from users where id = created_by_user_id) as created_by_name,
          created_at::text,
          updated_at::text
      `,
      [
        authMe.user.societyId,
        input.amenityId,
        input.title,
        startsAt.toISOString(),
        endsAt.toISOString(),
        input.reason ?? null,
        authMe.user.id,
      ],
    )
    const blackout = inserted.rows[0]

    if (!blackout) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Blackout creation failed.',
      })
    }

    await client.query('commit')

    queueAuditEvent(event, {
      module: 'MASTER',
      eventKey: 'amenity_blackout.created',
      action: 'CREATED',
      severity: 'MEDIUM',
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      metadata: {
        amenityId: input.amenityId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      },
      relatedEntities: [
        { entityTable: 'society_profile', entityId: authMe.user.societyId },
        {
          entityTable: 'amenity_blackouts',
          entityId: blackout.id,
          entityLabel: blackout.title,
        },
      ],
    })

    return mapBlackout(blackout)
  } catch (error) {
    await client.query('rollback')
    translateConflictError(error)
  } finally {
    client.release()
  }
}

export const clearAmenityBlackout = async (
  event: H3Event,
  authMe: AuthMe,
  blackoutId: string,
) => {
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const result = await client.query<BlackoutRow>(
      `
        with deleted as (
          delete from amenity_blackouts
          where id = $1
            and society_id = $2
          returning
            id,
            society_id,
            amenity_id,
            title,
            starts_at,
            ends_at,
            reason,
            created_by_user_id,
            created_at,
            updated_at
        )
        select
          deleted.id,
          deleted.society_id,
          deleted.amenity_id,
          amenity.name as amenity_name,
          deleted.title,
          deleted.starts_at::text,
          deleted.ends_at::text,
          deleted.reason,
          deleted.created_by_user_id,
          creator.full_name as created_by_name,
          deleted.created_at::text,
          deleted.updated_at::text
        from deleted
        inner join amenities amenity on amenity.id = deleted.amenity_id
        left join users creator on creator.id = deleted.created_by_user_id
      `,
      [blackoutId, authMe.user.societyId],
    )
    const blackout = result.rows[0]

    if (!blackout) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Blackout not found.',
      })
    }

    await client.query('commit')

    queueAuditEvent(event, {
      module: 'MASTER',
      eventKey: 'amenity_blackout.deleted',
      action: 'DELETED',
      severity: 'MEDIUM',
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      metadata: {
        amenityId: blackout.amenity_id,
        startsAt: blackout.starts_at,
        endsAt: blackout.ends_at,
        reason: blackout.reason,
      },
      relatedEntities: [
        { entityTable: 'society_profile', entityId: authMe.user.societyId },
        {
          entityTable: 'amenity_blackouts',
          entityId: blackout.id,
          entityLabel: blackout.title,
        },
      ],
    })

    return mapBlackout(blackout)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const listAmenityBlackouts = async (authMe: AuthMe) => {
  const result = await getDatabasePool().query<BlackoutRow>(
    `
      select
        blackout.id,
        blackout.society_id,
        blackout.amenity_id,
        amenity.name as amenity_name,
        blackout.title,
        blackout.starts_at::text,
        blackout.ends_at::text,
        blackout.reason,
        blackout.created_by_user_id,
        creator.full_name as created_by_name,
        blackout.created_at::text,
        blackout.updated_at::text
      from amenity_blackouts blackout
      inner join amenities amenity on amenity.id = blackout.amenity_id
      left join users creator on creator.id = blackout.created_by_user_id
      where blackout.society_id = $1
        and blackout.ends_at >= now() - interval '30 days'
      order by blackout.starts_at asc
      limit 200
    `,
    [authMe.user.societyId],
  )

  return result.rows.map(mapBlackout)
}
