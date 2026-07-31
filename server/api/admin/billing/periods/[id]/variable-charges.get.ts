import * as XLSX from 'xlsx/xlsx.mjs'
import { z } from 'zod'
import { createApiSuccess, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getQuerySafe, readUuidParam } from '~/server/utils/master-data'
import { AppError } from '~/server/utils/errors'
import { camAdvanceCoverageLateralSql } from '~/server/utils/cam-advance'
import { setEventHeader } from '~/server/utils/http-event'
import { createPdfBuffer } from '~/server/utils/pdf'

const querySchema = z.object({
  chargeName: z.string().trim().min(1).max(80).optional().default('DG Set'),
  export: z.string().trim().optional(),
  format: z.string().trim().optional(),
})

type FlatChargeRow = {
  flat_id: string
  flat_number: string
  block_name: string
  unit_type: string
  area_sq_ft: string | null
  cam_advance_covered_from: string | null
  cam_advance_paid_until: string | null
  cam_advance_note: string | null
  cam_advance_updated_at: string | null
  amount: string | null
  rate_per_sq_ft: string | null
  charge_breakdown: unknown
}

type VariableChargeEntry = {
  flatId: string
  flatNumber: string
  blockName: string
  unitType: string
  areaSqFt: number | null
  camAdvanceCoveredFrom: string | null
  camAdvancePaidUntil: string | null
  camAdvanceNote: string | null
  camAdvanceUpdatedAt: string | null
  meterNo: string | null
  openingReading: number | null
  closingReading: number | null
  consumedUnits: number | null
  ratePerUnit: number | null
  ratePerSqFt: number | null
  connectionLoad: string | null
  previousOutstanding: number | null
  interestAmount: number | null
  cycleMultiplier: number | null
  cycleLabel: string | null
  amount: number | null
}

type BillingPeriodExportInfo = {
  id: string
  label: string
  start_date: string
  end_date: string
  due_date: string
  charge_type: string
}

const readNumber = (source: Record<string, unknown>, key: string) => {
  const value = source[key]
  if (value == null) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const readString = (source: Record<string, unknown>, key: string) => {
  const value = source[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const getChargeMetadata = (value: unknown) => {
  const firstItem = Array.isArray(value) ? value[0] : null
  return firstItem && typeof firstItem === 'object'
    ? (firstItem as Record<string, unknown>)
    : {}
}

const getExportFormat = (query: z.infer<typeof querySchema>) => {
  const format = (query.export || query.format || '').toLowerCase()

  if (format === 'pdf' || format === 'xlsx' || format === 'excel') {
    return format === 'pdf' ? 'pdf' : 'xlsx'
  }

  return ''
}

const slugifyFileNamePart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'charges'

const buildExportFileName = (
  period: BillingPeriodExportInfo,
  chargeName: string,
  extension: 'pdf' | 'xlsx',
) =>
  `${slugifyFileNamePart(chargeName)}-${slugifyFileNamePart(period.label)}-${new Date().toISOString().slice(0, 10)}.${extension}`

const formatDate = (value: string | null | undefined) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
        dateStyle: 'medium',
      })
    : '-'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0))

const formatNumber = (value: number | null | undefined) =>
  value == null
    ? ''
    : new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 2,
      }).format(value)

const buildWorkbookRow = (entry: VariableChargeEntry) => ({
  Block: entry.blockName,
  Flat: entry.flatNumber,
  'Unit type': entry.unitType,
  Area: entry.areaSqFt ?? '',
  'Meter no.': entry.meterNo ?? '',
  Opening: entry.openingReading ?? '',
  Closing: entry.closingReading ?? '',
  Units: entry.consumedUnits ?? '',
  'Rate/unit': entry.ratePerUnit ?? '',
  'Rate/sq ft': entry.ratePerSqFt ?? '',
  'Connection load': entry.connectionLoad ?? '',
  'Previous outstanding': entry.previousOutstanding ?? 0,
  Interest: entry.interestAmount ?? 0,
  Cycle: entry.cycleLabel ?? entry.cycleMultiplier ?? '',
  Amount: entry.amount ?? 0,
  'CAM advance from': entry.camAdvanceCoveredFrom ?? '',
  'CAM advance until': entry.camAdvancePaidUntil ?? '',
  'CAM advance note': entry.camAdvanceNote ?? '',
})

const buildVariableChargesWorkbook = (
  items: VariableChargeEntry[],
  period: BillingPeriodExportInfo,
  chargeName: string,
) => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet(
    items.length
      ? items.map(buildWorkbookRow)
      : [{ Note: 'No saved charges found for the selected period.' }],
  )
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 20 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 28 },
  ]

  const totalAmount = items.reduce(
    (sum, item) => sum + Number(item.amount ?? 0),
    0,
  )
  const totalUnits = items.reduce(
    (sum, item) => sum + Number(item.consumedUnits ?? 0),
    0,
  )
  const summarySheet = XLSX.utils.json_to_sheet([
    { Metric: 'Charge', Value: chargeName },
    { Metric: 'Period', Value: period.label },
    { Metric: 'Period start', Value: period.start_date },
    { Metric: 'Period end', Value: period.end_date },
    { Metric: 'Due date', Value: period.due_date },
    { Metric: 'Bill type', Value: period.charge_type },
    { Metric: 'Generated at', Value: new Date().toISOString() },
    { Metric: 'Rows exported', Value: items.length },
    { Metric: 'Total units', Value: totalUnits },
    { Metric: 'Total amount', Value: totalAmount },
  ])

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Charges')
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

const buildPdfTableBody = (items: VariableChargeEntry[]) => {
  const body: unknown[][] = [
    [
      { text: 'Flat', style: 'tableHeader' },
      { text: 'Meter', style: 'tableHeader' },
      { text: 'Opening', style: 'tableHeader', alignment: 'right' },
      { text: 'Closing', style: 'tableHeader', alignment: 'right' },
      { text: 'Units', style: 'tableHeader', alignment: 'right' },
      { text: 'Rate', style: 'tableHeader', alignment: 'right' },
      { text: 'Load', style: 'tableHeader' },
      { text: 'Amount', style: 'tableHeader', alignment: 'right' },
    ],
  ]

  if (items.length === 0) {
    body.push([
      {
        text: 'No saved charges found for the selected period.',
        colSpan: 8,
        style: 'tableCell',
      },
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ])
    return body
  }

  body.push(
    ...items.map((entry) => [
      {
        text: `${entry.blockName} ${entry.flatNumber}\n${entry.unitType}`,
        style: 'tableCell',
      },
      { text: entry.meterNo ?? '-', style: 'tableCell' },
      {
        text: formatNumber(entry.openingReading) || '-',
        style: 'tableCell',
        alignment: 'right',
      },
      {
        text: formatNumber(entry.closingReading) || '-',
        style: 'tableCell',
        alignment: 'right',
      },
      {
        text: formatNumber(entry.consumedUnits) || '-',
        style: 'tableCell',
        alignment: 'right',
      },
      {
        text:
          formatNumber(entry.ratePerUnit) ||
          formatNumber(entry.ratePerSqFt) ||
          '-',
        style: 'tableCell',
        alignment: 'right',
      },
      { text: entry.connectionLoad ?? '-', style: 'tableCell' },
      {
        text: formatMoney(entry.amount),
        style: 'tableCell',
        alignment: 'right',
      },
    ]),
  )

  return body
}

const buildVariableChargesPdf = async (
  items: VariableChargeEntry[],
  period: BillingPeriodExportInfo,
  chargeName: string,
) => {
  const totalAmount = items.reduce(
    (sum, item) => sum + Number(item.amount ?? 0),
    0,
  )
  const totalUnits = items.reduce(
    (sum, item) => sum + Number(item.consumedUnits ?? 0),
    0,
  )

  return await createPdfBuffer({
    pageOrientation: 'landscape',
    pageMargins: [28, 42, 28, 36],
    content: [
      { text: chargeName, style: 'title' },
      {
        text: `${period.label} | ${formatDate(period.start_date)} to ${formatDate(period.end_date)} | Due ${formatDate(period.due_date)} | Generated ${new Date().toISOString()}`,
        style: 'subtle',
        margin: [0, 0, 0, 12],
      },
      {
        columns: [
          { text: `Rows\n${items.length}`, style: 'summaryBox' },
          {
            text: `Units\n${formatNumber(totalUnits) || '0'}`,
            style: 'summaryBox',
          },
          { text: `Amount\n${formatMoney(totalAmount)}`, style: 'summaryBox' },
          { text: `Bill type\n${period.charge_type}`, style: 'summaryBox' },
        ],
        columnGap: 8,
        margin: [0, 0, 0, 12],
      },
      {
        table: {
          headerRows: 1,
          widths: ['17%', '12%', '10%', '10%', '9%', '9%', '14%', '19%'],
          body: buildPdfTableBody(items),
        },
        layout: 'lightHorizontalLines',
      },
      {
        text: 'This is a system-generated charge entry export.',
        style: 'footerNote',
        margin: [0, 12, 0, 0],
      },
    ],
    styles: {
      title: {
        fontSize: 18,
        bold: true,
        color: '#2f4050',
        margin: [0, 0, 0, 4],
      },
      subtle: { fontSize: 8, color: '#768390' },
      summaryBox: {
        fontSize: 9,
        color: '#111827',
        bold: true,
        margin: [0, 6, 0, 6],
      },
      tableHeader: {
        bold: true,
        fontSize: 8,
        color: '#ffffff',
        fillColor: '#2a3f54',
      },
      tableCell: { fontSize: 7, color: '#2f4050' },
      footerNote: { fontSize: 8, color: '#768390', italics: true },
    },
    defaultStyle: { font: 'Roboto' },
  })
}

const mapChargeRow = (row: FlatChargeRow): VariableChargeEntry => {
  const metadata = getChargeMetadata(row.charge_breakdown)

  return {
    flatId: row.flat_id,
    flatNumber: row.flat_number,
    blockName: row.block_name,
    unitType: row.unit_type,
    areaSqFt:
      readNumber(metadata, 'areaSqFt') ??
      (row.area_sq_ft == null ? null : Number(row.area_sq_ft)),
    camAdvanceCoveredFrom: row.cam_advance_covered_from,
    camAdvancePaidUntil: row.cam_advance_paid_until,
    camAdvanceNote: row.cam_advance_note,
    camAdvanceUpdatedAt: row.cam_advance_updated_at,
    meterNo: readString(metadata, 'meterNo'),
    openingReading: readNumber(metadata, 'openingReading'),
    closingReading: readNumber(metadata, 'closingReading'),
    consumedUnits: readNumber(metadata, 'consumedUnits'),
    ratePerUnit: readNumber(metadata, 'ratePerUnit'),
    ratePerSqFt:
      readNumber(metadata, 'ratePerSqFt') ??
      (row.rate_per_sq_ft == null ? null : Number(row.rate_per_sq_ft)),
    connectionLoad: readString(metadata, 'connectionLoad'),
    previousOutstanding: readNumber(metadata, 'previousOutstanding'),
    interestAmount: readNumber(metadata, 'interestAmount'),
    cycleMultiplier: readNumber(metadata, 'cycleMultiplier'),
    cycleLabel: readString(metadata, 'cycleLabel'),
    amount:
      row.amount == null ? readNumber(metadata, 'amount') : Number(row.amount),
  }
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const periodId = readUuidParam(event, 'id')
  const query = validateInput(querySchema, getQuerySafe(event))
  const pool = getDatabasePool()

  const periodResult = await pool.query<BillingPeriodExportInfo>(
    `
      select
        id,
        label,
        start_date::text,
        end_date::text,
        due_date::text,
        charge_type::text
      from billing_periods
      where id = $1 and society_id = $2
      limit 1
    `,
    [periodId, authMe.user.societyId],
  )

  const period = periodResult.rows[0]
  if (!period) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Bill cycle not found.',
    })
  }

  const result = await pool.query<FlatChargeRow>(
    `
      select
        f.id as flat_id,
        f.flat_number,
        b.name as block_name,
        f.unit_type,
        f.area_sq_ft::text as area_sq_ft,
        coverage.covered_from::text as cam_advance_covered_from,
        coverage.covered_until::text as cam_advance_paid_until,
        coverage.notes as cam_advance_note,
        f.cam_advance_updated_at::text as cam_advance_updated_at,
        mc.amount::text,
        mc.rate_per_sq_ft::text,
        mc.charge_breakdown
      from flats f
      inner join blocks b on b.id = f.block_id
      inner join billing_periods bp on bp.id = $2 and bp.society_id = f.society_id
      left join lateral (
        ${camAdvanceCoverageLateralSql('f', 'bp')}
      ) coverage on true
      left join maintenance_charges mc
        on mc.society_id = f.society_id
       and mc.billing_period_id = $2
       and mc.scope = 'FLAT'
       and mc.flat_id = f.id
       and mc.charge_name = $3
       and mc.is_active = true
      where f.society_id = $1
        and f.is_active = true
      order by
        b.sort_order asc,
        b.name asc,
        nullif(regexp_replace(coalesce(f.floor_label, ''), '\\D', '', 'g'), '')::integer asc nulls last,
        nullif(regexp_replace(f.flat_number, '\\D', '', 'g'), '')::integer asc nulls last,
        f.flat_number asc
    `,
    [authMe.user.societyId, periodId, query.chargeName],
  )
  const items = result.rows.map(mapChargeRow)
  const exportFormat = getExportFormat(query)

  if (exportFormat === 'pdf') {
    const fileName = buildExportFileName(period, query.chargeName, 'pdf')

    setEventHeader(event, 'content-type', 'application/pdf')
    setEventHeader(
      event,
      'content-disposition',
      `attachment; filename="${fileName}"`,
    )

    return await buildVariableChargesPdf(items, period, query.chargeName)
  }

  if (exportFormat === 'xlsx') {
    const fileName = buildExportFileName(period, query.chargeName, 'xlsx')

    setEventHeader(
      event,
      'content-type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    setEventHeader(
      event,
      'content-disposition',
      `attachment; filename="${fileName}"`,
    )

    return buildVariableChargesWorkbook(items, period, query.chargeName)
  }

  return createApiSuccess(event, {
    billingPeriodId: periodId,
    chargeName: query.chargeName,
    items,
  })
})
