import { getQuery, setHeader } from 'h3'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'

type GateLogRow = {
  id: string
  scanned_at: string
  guard_name: string | null
  resident_name: string | null
  flat_label: string | null
  scan_result: string
  denial_reason: string | null
  gate_name: string | null
}

const csvEscape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = getQuery(event)
  const params: unknown[] = [authMe.user.societyId]
  const filters = ['gsl.society_id = $1']

  if (query.result) {
    params.push(String(query.result).toUpperCase())
    filters.push(`gsl.scan_result = $${params.length}`)
  }
  if (query.guardId) {
    params.push(String(query.guardId))
    filters.push(`gsl.guard_user_id = $${params.length}`)
  }
  if (query.residentId) {
    params.push(String(query.residentId))
    filters.push(`gsl.user_id = $${params.length}`)
  }
  if (query.from) {
    params.push(String(query.from))
    filters.push(`gsl.scanned_at >= $${params.length}::date`)
  }
  if (query.to) {
    params.push(String(query.to))
    filters.push(`gsl.scanned_at < ($${params.length}::date + interval '1 day')`)
  }
  if (query.reason) {
    params.push(`%${String(query.reason)}%`)
    filters.push(`gsl.denial_reason ilike $${params.length}`)
  }

  const result = await getDatabasePool().query<GateLogRow>(
    `
      select
        gsl.id,
        gsl.scanned_at::text,
        guard.full_name as guard_name,
        resident.full_name as resident_name,
        nullif(concat_ws(' ', b.name, f.flat_number), '') as flat_label,
        gsl.scan_result::text,
        gsl.denial_reason,
        gsl.gate_name
      from gate_scan_logs gsl
      left join users guard on guard.id = gsl.guard_user_id
      left join users resident on resident.id = gsl.user_id
      left join flat_residents fr on fr.user_id = resident.id and fr.is_active = true
      left join flats f on f.id = coalesce(gsl.flat_id, fr.flat_id)
      left join blocks b on b.id = f.block_id
      where ${filters.join(' and ')}
      order by gsl.scanned_at desc
      limit 500
    `,
    params,
  )

  if (query.export === 'csv' || query.export === 'excel') {
    setHeader(event, 'content-type', 'text/csv; charset=utf-8')
    setHeader(event, 'content-disposition', 'attachment; filename="gate-log.csv"')
    return [
      ['Scanned at', 'Guard', 'Resident', 'Flat', 'Result', 'Reason', 'Gate'].map(csvEscape).join(','),
      ...result.rows.map((row) =>
        [
          row.scanned_at,
          row.guard_name,
          row.resident_name,
          row.flat_label,
          row.scan_result,
          row.denial_reason,
          row.gate_name,
        ]
          .map(csvEscape)
          .join(','),
      ),
    ].join('\n')
  }

  return createApiSuccess(event, {
    items: result.rows.map((row) => ({
      id: row.id,
      scannedAt: row.scanned_at,
      guardName: row.guard_name,
      residentName: row.resident_name,
      flatLabel: row.flat_label,
      result: row.scan_result,
      reason: row.denial_reason,
      gateName: row.gate_name,
    })),
  })
})
