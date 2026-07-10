import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'
import { QR_SCAN_ROLES } from '~/shared/auth'

type CountValue = number | string | null | undefined

type TodayRow = {
  timezone: string
  scan_date: string
  total_scans: CountValue
  granted_scans: CountValue
  denied_scans: CountValue
  expired_scans: CountValue
  revoked_scans: CountValue
  invalid_scans: CountValue
  first_scan_at: string | null
  latest_scan_at: string | null
}

type DailyRow = {
  scan_date: string
  total_scans: CountValue
  granted_scans: CountValue
  blocked_scans: CountValue
  invalid_scans: CountValue
}

const toNumber = (value: CountValue) => Number(value ?? 0)

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, QR_SCAN_ROLES)
  const params = [authMe.user.societyId, authMe.user.id]

  const todayResult = await queryRows<TodayRow>(
    `
      with settings as (
        select coalesce(nullif(timezone, ''), 'Asia/Kolkata') as timezone
        from society_profile
        where id = $1
      ),
      local_window as (
        select timezone, (now() at time zone timezone)::date as today
        from settings
      )
      select
        lw.timezone,
        lw.today::text as scan_date,
        count(gsl.id)::int as total_scans,
        count(gsl.id) filter (where gsl.scan_result = 'GRANTED')::int as granted_scans,
        count(gsl.id) filter (where gsl.scan_result = 'DENIED')::int as denied_scans,
        count(gsl.id) filter (where gsl.scan_result = 'EXPIRED')::int as expired_scans,
        count(gsl.id) filter (where gsl.scan_result = 'REVOKED')::int as revoked_scans,
        count(gsl.id) filter (where gsl.scan_result = 'INVALID')::int as invalid_scans,
        min(gsl.scanned_at)::text as first_scan_at,
        max(gsl.scanned_at)::text as latest_scan_at
      from local_window lw
      left join gate_scan_logs gsl
        on gsl.society_id = $1
       and gsl.guard_user_id = $2
       and gsl.scanned_at >= (lw.today::timestamp at time zone lw.timezone)
       and gsl.scanned_at < ((lw.today + 1)::timestamp at time zone lw.timezone)
      group by lw.timezone, lw.today
    `,
    params,
  )

  const dailyResult = await queryRows<DailyRow>(
    `
      with settings as (
        select coalesce(nullif(timezone, ''), 'Asia/Kolkata') as timezone
        from society_profile
        where id = $1
      ),
      local_window as (
        select timezone, (now() at time zone timezone)::date as today
        from settings
      ),
      days as (
        select generate_series(lw.today - 6, lw.today, interval '1 day')::date as scan_date
        from local_window lw
      ),
      logs as (
        select
          (gsl.scanned_at at time zone lw.timezone)::date as scan_date,
          gsl.scan_result
        from gate_scan_logs gsl
        cross join local_window lw
        where gsl.society_id = $1
          and gsl.guard_user_id = $2
          and gsl.scanned_at >= ((lw.today - 6)::timestamp at time zone lw.timezone)
          and gsl.scanned_at < ((lw.today + 1)::timestamp at time zone lw.timezone)
      )
      select
        d.scan_date::text,
        count(l.scan_result)::int as total_scans,
        count(l.scan_result) filter (where l.scan_result = 'GRANTED')::int as granted_scans,
        count(l.scan_result) filter (where l.scan_result <> 'GRANTED')::int as blocked_scans,
        count(l.scan_result) filter (where l.scan_result = 'INVALID')::int as invalid_scans
      from days d
      left join logs l on l.scan_date = d.scan_date
      group by d.scan_date
      order by d.scan_date asc
    `,
    params,
  )

  const today = todayResult.rows[0]

  return createApiSuccess(event, {
    timezone: today?.timezone ?? 'Asia/Kolkata',
    today: {
      date: today?.scan_date ?? new Date().toISOString().slice(0, 10),
      total: toNumber(today?.total_scans),
      granted: toNumber(today?.granted_scans),
      denied: toNumber(today?.denied_scans),
      expired: toNumber(today?.expired_scans),
      revoked: toNumber(today?.revoked_scans),
      invalid: toNumber(today?.invalid_scans),
      firstScanAt: today?.first_scan_at ?? null,
      latestScanAt: today?.latest_scan_at ?? null,
    },
    daily: dailyResult.rows.map((row) => ({
      date: row.scan_date,
      total: toNumber(row.total_scans),
      granted: toNumber(row.granted_scans),
      blocked: toNumber(row.blocked_scans),
      invalid: toNumber(row.invalid_scans),
    })),
  })
})
