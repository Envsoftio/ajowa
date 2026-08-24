import type { H3Event } from 'h3'
import { z } from 'zod'
import { createApiSuccess, validateInput } from './api'
import { getDatabasePool } from './database'
import { AppError } from './errors'
import { getEventQuery } from './http-event'
import { normalizeSocietySettings } from './master-data'
import {
  activeTicketStatuses,
  serviceRequestStatuses,
} from '~/shared/service-requests'
import type { AuthMe } from '~/types/auth'
import type {
  ResidentServiceRequestStatisticsResponse,
  ServiceLocationType,
  ServicePriority,
  ServiceRequestStatistics,
  ServiceRequestStatisticsGranularity,
  ServiceRequestStatus,
} from '~/types/domain'

const locationTypes = ['FLAT', 'COMMON_AREA', 'SOCIETY_ASSET'] as const
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'] as const
const MAX_STATISTICS_RANGE_DAYS = 731

const optionalQueryEnum = <T extends readonly [string, ...string[]]>(
  values: T,
) =>
  z.preprocess((value) => {
    const item = Array.isArray(value) ? value[0] : value
    return item === '' || item == null ? undefined : item
  }, z.enum(values).optional())

const optionalQueryText = z.preprocess((value) => {
  const item = Array.isArray(value) ? value[0] : value
  return typeof item === 'string' && item.trim() ? item.trim() : undefined
}, z.string().max(120).optional())

const statisticsQuerySchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  status: optionalQueryEnum(serviceRequestStatuses),
  category: optionalQueryText,
  departmentId: z.preprocess((value) => {
    const item = Array.isArray(value) ? value[0] : value
    return item === '' || item == null ? undefined : item
  }, z.string().uuid().optional()),
  priority: optionalQueryEnum(priorities),
  locationType: optionalQueryEnum(locationTypes),
})

type StatisticsQuery = z.infer<typeof statisticsQuerySchema>

type SocietyStatisticsSettingsRow = {
  timezone: string
  settings: Record<string, unknown> | null
}

const formatDateInTimezone = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  )

  return `${values.year}-${values.month}-${values.day}`
}

const addUtcDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export const getStatisticsRangeDays = (startDate: string, endDate: string) =>
  Math.floor(
    (Date.parse(`${endDate}T00:00:00.000Z`) -
      Date.parse(`${startDate}T00:00:00.000Z`)) /
      86_400_000,
  ) + 1

export const getStatisticsGranularity = (
  rangeDays: number,
): ServiceRequestStatisticsGranularity => {
  if (rangeDays <= 31) return 'DAY'
  if (rangeDays <= 180) return 'WEEK'
  return 'MONTH'
}

const parseStatisticsQuery = (
  event: H3Event,
  timezone: string,
): StatisticsQuery => {
  const today = formatDateInTimezone(new Date(), timezone)
  const query = getEventQuery(event)
  const parsed = validateInput(statisticsQuerySchema, {
    ...query,
    startDate: query.startDate || addUtcDays(today, -89),
    endDate: query.endDate || today,
  })
  const rangeDays = getStatisticsRangeDays(parsed.startDate, parsed.endDate)

  if (rangeDays < 1) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'End date must be on or after start date.',
    })
  }

  if (rangeDays > MAX_STATISTICS_RANGE_DAYS) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Choose a date range of two years or less.',
    })
  }

  if (parsed.endDate > today) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'End date cannot be in the future.',
    })
  }

  return parsed
}

const addStatisticsFilters = (input: StatisticsQuery, values: unknown[]) => {
  const where = ['sr.society_id = $1']

  const simpleFilters: Array<[unknown, string, string?]> = [
    [input.status, 'sr.status::text'],
    [input.category?.toUpperCase(), 'upper(sr.category)'],
    [input.departmentId, 'sr.department_id'],
    [input.priority, 'sr.priority::text'],
    [input.locationType, 'sr.location_type::text'],
  ]

  for (const [value, column] of simpleFilters) {
    if (value) {
      values.push(value)
      where.push(`${column} = $${values.length}`)
    }
  }

  return where
}

const asNumber = (value: string | number | null | undefined) =>
  Number(value ?? 0)

const asNullableRoundedNumber = (
  value: string | number | null | undefined,
  digits = 1,
) => {
  if (value == null) return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  const scale = 10 ** digits
  return Math.round(number * scale) / scale
}

export const getResidentServiceRequestStatistics = async (
  event: H3Event,
  authMe: AuthMe,
): Promise<ResidentServiceRequestStatisticsResponse> => {
  const pool = getDatabasePool()
  const settingsResult = await pool.query<SocietyStatisticsSettingsRow>(
    `select timezone, settings from society_profile where id = $1 limit 1`,
    [authMe.user.societyId],
  )
  const society = settingsResult.rows[0]

  if (!society) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Society profile not found.',
    })
  }

  if (
    !normalizeSocietySettings(society.settings).residentServiceStatisticsEnabled
  ) {
    return { enabled: false }
  }

  const filters = parseStatisticsQuery(event, society.timezone)
  const rangeDays = getStatisticsRangeDays(filters.startDate, filters.endDate)
  const granularity = getStatisticsGranularity(rangeDays)
  const dateTrunc = granularity.toLowerCase()
  const interval =
    granularity === 'DAY'
      ? '1 day'
      : granularity === 'WEEK'
        ? '1 week'
        : '1 month'
  const values: unknown[] = [
    authMe.user.societyId,
    filters.startDate,
    filters.endDate,
    society.timezone,
  ]
  const where = addStatisticsFilters(filters, values)
  const whereSql = where.join(' and ')
  const rangeStartSql = '($2::date at time zone $4)'
  const rangeEndSql = '(($3::date + 1) at time zone $4)'
  const createdInRange = `sr.created_at >= ${rangeStartSql} and sr.created_at < ${rangeEndSql}`
  const resolvedInRange = `sr.resolved_at >= ${rangeStartSql} and sr.resolved_at < ${rangeEndSql}`
  const closedInRange = `sr.closed_at >= ${rangeStartSql} and sr.closed_at < ${rangeEndSql}`
  const reopenedInRange = `sr.reopened_at >= ${rangeStartSql} and sr.reopened_at < ${rangeEndSql}`
  const activeStatusesParam = values.length + 1
  const queryValues = [...values, activeTicketStatuses]

  const [
    summaryResult,
    trendResult,
    statusResult,
    categoryResult,
    departmentResult,
    priorityResult,
    locationResult,
    optionResult,
  ] = await Promise.all([
    pool.query<{
      opened: string
      resolved: string
      closed: string
      reopened: string
      active_now: string
      overdue_now: string
      sla_breached: string
      cohort_resolved: string
      average_first_response_minutes: string | null
      average_resolution_hours: string | null
    }>(
      `
        select
          count(*) filter (where ${createdInRange})::text as opened,
          count(*) filter (where ${resolvedInRange})::text as resolved,
          count(*) filter (where ${closedInRange})::text as closed,
          count(*) filter (where ${reopenedInRange})::text as reopened,
          count(*) filter (where sr.status = any($${activeStatusesParam}::service_request_status[]))::text as active_now,
          count(*) filter (
            where sr.status = any($${activeStatusesParam}::service_request_status[])
              and sr.due_by_at < now()
          )::text as overdue_now,
          count(*) filter (where ${createdInRange} and sr.is_sla_breached)::text as sla_breached,
          count(*) filter (
            where ${createdInRange} and sr.status in ('RESOLVED', 'CLOSED')
          )::text as cohort_resolved,
          avg(extract(epoch from (sr.first_responded_at - sr.created_at)) / 60)
            filter (where ${createdInRange} and sr.first_responded_at is not null)::text
            as average_first_response_minutes,
          avg(extract(epoch from (sr.resolved_at - sr.created_at)) / 3600)
            filter (where ${resolvedInRange})::text as average_resolution_hours
        from service_requests sr
        where ${whereSql}
      `,
      queryValues,
    ),
    pool.query<{
      period_start: string
      opened: string
      resolved: string
      closed: string
    }>(
      `
        with filtered as (
          select sr.created_at, sr.resolved_at, sr.closed_at
          from service_requests sr
          where ${whereSql}
        ),
        buckets as (
          select generate_series(
            date_trunc('${dateTrunc}', $2::date)::date,
            date_trunc('${dateTrunc}', $3::date)::date,
            interval '${interval}'
          )::date as period_start
        ),
        activity as (
          select
            date_trunc('${dateTrunc}', event_at at time zone $4)::date as period_start,
            event_type,
            count(*)::integer as total
          from (
            select created_at as event_at, 'OPENED'::text as event_type
            from filtered
            where created_at >= ${rangeStartSql} and created_at < ${rangeEndSql}
            union all
            select resolved_at, 'RESOLVED'
            from filtered
            where resolved_at >= ${rangeStartSql} and resolved_at < ${rangeEndSql}
            union all
            select closed_at, 'CLOSED'
            from filtered
            where closed_at >= ${rangeStartSql} and closed_at < ${rangeEndSql}
          ) events
          group by 1, 2
        )
        select
          buckets.period_start::text,
          coalesce(sum(activity.total) filter (where activity.event_type = 'OPENED'), 0)::text as opened,
          coalesce(sum(activity.total) filter (where activity.event_type = 'RESOLVED'), 0)::text as resolved,
          coalesce(sum(activity.total) filter (where activity.event_type = 'CLOSED'), 0)::text as closed
        from buckets
        left join activity on activity.period_start = buckets.period_start
        group by buckets.period_start
        order by buckets.period_start
      `,
      values,
    ),
    pool.query<{ status: ServiceRequestStatus; count: string }>(
      `
        select sr.status::text as status, count(*)::text as count
        from service_requests sr
        where ${whereSql} and ${createdInRange}
        group by sr.status
        order by count(*) desc, sr.status
      `,
      values,
    ),
    pool.query<{
      category: string
      opened: string
      resolved: string
      active: string
      overdue: string
    }>(
      `
        select
          sr.category,
          count(*) filter (where ${createdInRange})::text as opened,
          count(*) filter (where ${resolvedInRange})::text as resolved,
          count(*) filter (where sr.status = any($${activeStatusesParam}::service_request_status[]))::text as active,
          count(*) filter (
            where sr.status = any($${activeStatusesParam}::service_request_status[])
              and sr.due_by_at < now()
          )::text as overdue
        from service_requests sr
        where ${whereSql}
        group by sr.category
        having count(*) filter (where ${createdInRange} or ${resolvedInRange} or sr.status = any($${activeStatusesParam}::service_request_status[])) > 0
        order by count(*) filter (where ${createdInRange}) desc, sr.category
        limit 20
      `,
      queryValues,
    ),
    pool.query<{
      department_id: string | null
      department_name: string | null
      opened: string
      resolved: string
      active: string
      overdue: string
    }>(
      `
        select
          sr.department_id,
          coalesce(sd.name, 'Unassigned') as department_name,
          count(*) filter (where ${createdInRange})::text as opened,
          count(*) filter (where ${resolvedInRange})::text as resolved,
          count(*) filter (where sr.status = any($${activeStatusesParam}::service_request_status[]))::text as active,
          count(*) filter (
            where sr.status = any($${activeStatusesParam}::service_request_status[])
              and sr.due_by_at < now()
          )::text as overdue
        from service_requests sr
        left join service_departments sd on sd.id = sr.department_id
        where ${whereSql}
        group by sr.department_id, sd.name
        having count(*) filter (where ${createdInRange} or ${resolvedInRange} or sr.status = any($${activeStatusesParam}::service_request_status[])) > 0
        order by count(*) filter (where ${createdInRange}) desc, department_name
      `,
      queryValues,
    ),
    pool.query<{ priority: ServicePriority; count: string }>(
      `
        select sr.priority::text as priority, count(*)::text as count
        from service_requests sr
        where ${whereSql} and ${createdInRange}
        group by sr.priority
        order by count(*) desc, sr.priority
      `,
      values,
    ),
    pool.query<{ location_type: ServiceLocationType; count: string }>(
      `
        select sr.location_type::text as location_type, count(*)::text as count
        from service_requests sr
        where ${whereSql} and ${createdInRange}
        group by sr.location_type
        order by count(*) desc, sr.location_type
      `,
      values,
    ),
    pool.query<{
      departments: Array<{ id: string; name: string }> | null
      categories: string[] | null
    }>(
      `
        select
          coalesce((
            select jsonb_agg(jsonb_build_object('id', sd.id, 'name', sd.name) order by sd.name)
            from service_departments sd
            where sd.society_id = $1 and sd.is_active = true
          ), '[]'::jsonb) as departments,
          coalesce((
            select jsonb_agg(category order by category)
            from (
              select distinct sr.category
              from service_requests sr
              where sr.society_id = $1
            ) categories
          ), '[]'::jsonb) as categories
      `,
      [authMe.user.societyId],
    ),
  ])

  const summary = summaryResult.rows[0]
  const opened = asNumber(summary?.opened)
  const cohortResolved = asNumber(summary?.cohort_resolved)
  const options = optionResult.rows[0]
  const statistics: ServiceRequestStatistics = {
    filters: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      status: filters.status ?? null,
      category: filters.category ?? null,
      departmentId: filters.departmentId ?? null,
      priority: filters.priority ?? null,
      locationType: filters.locationType ?? null,
    },
    granularity,
    summary: {
      openedDuringPeriod: opened,
      resolvedDuringPeriod: asNumber(summary?.resolved),
      closedDuringPeriod: asNumber(summary?.closed),
      reopenedDuringPeriod: asNumber(summary?.reopened),
      activeNow: asNumber(summary?.active_now),
      overdueNow: asNumber(summary?.overdue_now),
      slaBreachedOpenedDuringPeriod: asNumber(summary?.sla_breached),
      resolutionRate:
        opened > 0 ? Math.round((cohortResolved / opened) * 1000) / 10 : 0,
      averageFirstResponseMinutes: asNullableRoundedNumber(
        summary?.average_first_response_minutes,
      ),
      averageResolutionHours: asNullableRoundedNumber(
        summary?.average_resolution_hours,
      ),
    },
    trend: trendResult.rows.map((row) => ({
      periodStart: row.period_start,
      opened: asNumber(row.opened),
      resolved: asNumber(row.resolved),
      closed: asNumber(row.closed),
    })),
    statusBreakdown: statusResult.rows.map((row) => ({
      status: row.status,
      count: asNumber(row.count),
    })),
    categoryBreakdown: categoryResult.rows.map((row) => ({
      category: row.category,
      opened: asNumber(row.opened),
      resolved: asNumber(row.resolved),
      active: asNumber(row.active),
      overdue: asNumber(row.overdue),
    })),
    departmentBreakdown: departmentResult.rows.map((row) => ({
      departmentId: row.department_id,
      departmentName: row.department_name ?? 'Unassigned',
      opened: asNumber(row.opened),
      resolved: asNumber(row.resolved),
      active: asNumber(row.active),
      overdue: asNumber(row.overdue),
    })),
    priorityBreakdown: priorityResult.rows.map((row) => ({
      priority: row.priority,
      count: asNumber(row.count),
    })),
    locationBreakdown: locationResult.rows.map((row) => ({
      locationType: row.location_type,
      count: asNumber(row.count),
    })),
    options: {
      departments: options?.departments ?? [],
      categories: options?.categories ?? [],
    },
  }

  return { enabled: true, statistics }
}

export const createResidentServiceRequestStatisticsResponse = async (
  event: H3Event,
  authMe: AuthMe,
) =>
  createApiSuccess(
    event,
    await getResidentServiceRequestStatistics(event, authMe),
  )
