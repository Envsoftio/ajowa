import { getQuery, setHeader } from 'h3'
import * as XLSX from 'xlsx'
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
const pdfEscape = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')

const mapExportRow = (row: GateLogRow) => ({
  'Scanned at': row.scanned_at,
  Guard: row.guard_name,
  Resident: row.resident_name,
  Flat: row.flat_label,
  Result: row.scan_result,
  Reason: row.denial_reason,
  Gate: row.gate_name,
})

const buildSimplePdf = (rows: GateLogRow[]) => {
  const lines = [
    'AJOWA Gate Log',
    `Generated at ${new Date().toISOString()}`,
    '',
    ...rows.slice(0, 80).map((row) =>
      [
        row.scanned_at,
        row.scan_result,
        row.resident_name ?? 'Unknown resident',
        row.flat_label ?? 'No flat',
        row.guard_name ?? 'Unknown guard',
        row.denial_reason ?? '',
      ].join(' | '),
    ),
  ]
  const textOps = lines
    .map((line, index) => `${index === 0 ? '40 790 Td' : '0 -14 Td'} (${pdfEscape(line.slice(0, 150))}) Tj`)
    .join('\n')
  const stream = `BT /F1 10 Tf ${textOps} ET`
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${object}\n`
  }
  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return Buffer.from(pdf)
}

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
  if (query.flatId) {
    params.push(String(query.flatId))
    filters.push(`(gsl.flat_id = $${params.length} or exists (
      select 1
      from flat_residents fr_filter
      where fr_filter.user_id = gsl.user_id
        and fr_filter.flat_id = $${params.length}
        and fr_filter.is_active = true
    ))`)
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
        string_agg(distinct nullif(concat_ws(' ', b.name, f.flat_number), ''), ', ') as flat_label,
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
      group by gsl.id, guard.full_name, resident.full_name
      order by gsl.scanned_at desc
      limit 500
    `,
    params,
  )

  if (query.export === 'pdf') {
    setHeader(event, 'content-type', 'application/pdf')
    setHeader(event, 'content-disposition', 'attachment; filename="gate-log.pdf"')
    return buildSimplePdf(result.rows)
  }

  if (query.export === 'excel' || query.export === 'xlsx') {
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(result.rows.map(mapExportRow))
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Gate Log')
    setHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'content-disposition', 'attachment; filename="gate-log.xlsx"')
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }

  if (query.export === 'csv') {
    setHeader(event, 'content-type', 'text/csv; charset=utf-8')
    setHeader(event, 'content-disposition', 'attachment; filename="gate-log.csv"')
    return [
      ['Scanned at', 'Guard', 'Resident', 'Flat', 'Result', 'Reason', 'Gate'].map(csvEscape).join(','),
      ...result.rows.map((row) => Object.values(mapExportRow(row)).map(csvEscape).join(',')),
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
