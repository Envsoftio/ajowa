import * as XLSX from 'xlsx/xlsx.mjs'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { setEventHeader } from '~/server/utils/http-event'
import { getQuerySafe } from '~/server/utils/master-data'
import { createPdfBuffer, getSocietyStampImage } from '~/server/utils/pdf'
import { getSocietyInfo } from '~/server/utils/reports'

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

const mapExportRow = (row: GateLogRow) => ({
  'Scanned at': row.scanned_at,
  Guard: row.guard_name,
  Resident: row.resident_name,
  Flat: row.flat_label,
  Result: row.scan_result,
  Reason: row.denial_reason,
  Gate: row.gate_name,
})

const buildGateLogPdf = async (rows: GateLogRow[], societyId: string) => {
  const society = await getSocietyInfo(societyId)
  const stampImage = getSocietyStampImage()
  const body: unknown[][] = [
    [
      { text: 'Scanned at', style: 'tableHeader' },
      { text: 'Result', style: 'tableHeader' },
      { text: 'Resident', style: 'tableHeader' },
      { text: 'Flat', style: 'tableHeader' },
      { text: 'Guard', style: 'tableHeader' },
      { text: 'Reason', style: 'tableHeader' },
      { text: 'Gate', style: 'tableHeader' },
    ],
    ...rows.map((row) => [
      { text: row.scanned_at, style: 'tableCell' },
      { text: row.scan_result, style: 'tableCell' },
      { text: row.resident_name ?? '-', style: 'tableCell' },
      { text: row.flat_label ?? '-', style: 'tableCell' },
      { text: row.guard_name ?? '-', style: 'tableCell' },
      { text: row.denial_reason ?? '-', style: 'tableCell' },
      { text: row.gate_name ?? '-', style: 'tableCell' },
    ]),
  ]

  if (body.length === 1) {
    body.push([
      { text: 'No gate log records found for the selected filters.', colSpan: 7, style: 'tableCell' },
      '',
      '',
      '',
      '',
      '',
      '',
    ])
  }

  return await createPdfBuffer({
    pageOrientation: 'landscape',
    pageMargins: [28, 42, 28, 36],
    content: [
      { text: society.name, style: 'brand' },
      { text: society.address, style: 'subtle' },
      { text: 'Gate Log', style: 'title' },
      { text: `Generated ${new Date().toISOString()} | Rows: ${rows.length}`, style: 'subtle', margin: [0, 0, 0, 12] },
      {
        table: {
          headerRows: 1,
          widths: ['15%', '10%', '16%', '12%', '14%', '*', '10%'],
          body,
        },
        layout: 'lightHorizontalLines',
      },
      {
        columns: [
          {
            stack: [
              ...(stampImage
                ? [
                    {
                      image: stampImage,
                      fit: [112, 70],
                      margin: [0, 0, 0, 4],
                    },
                  ]
                : []),
              {
                text: [
                  `${society.name}\n`,
                  'Authorised Signatory',
                ],
                style: 'signature',
              },
            ],
          },
          {
            text: 'This is a system-generated gate access report.',
            style: 'footerNote',
            alignment: 'right',
          },
        ],
        columnGap: 16,
        margin: [0, 16, 0, 0],
      },
    ],
    styles: {
      brand: { fontSize: 10, color: '#0f766e', bold: true, margin: [0, 0, 0, 4] },
      title: { fontSize: 18, bold: true, color: '#2f4050', margin: [0, 10, 0, 4] },
      subtle: { fontSize: 8, color: '#768390' },
      tableHeader: { bold: true, fontSize: 8, color: '#ffffff', fillColor: '#2a3f54' },
      tableCell: { fontSize: 7, color: '#2f4050' },
      signature: { fontSize: 8, color: '#111827', bold: true },
      footerNote: { fontSize: 8, color: '#768390', italics: true },
    },
    defaultStyle: { font: 'Roboto' },
  })
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = getQuerySafe(event)
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
    setEventHeader(event, 'content-type', 'application/pdf')
    setEventHeader(event, 'content-disposition', 'attachment; filename="gate-log.pdf"')
    return await buildGateLogPdf(result.rows, authMe.user.societyId)
  }

  if (query.export === 'excel' || query.export === 'xlsx') {
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(result.rows.map(mapExportRow))
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Gate Log')
    setEventHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setEventHeader(event, 'content-disposition', 'attachment; filename="gate-log.xlsx"')
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }

  if (query.export === 'csv') {
    setEventHeader(event, 'content-type', 'text/csv; charset=utf-8')
    setEventHeader(event, 'content-disposition', 'attachment; filename="gate-log.csv"')
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
