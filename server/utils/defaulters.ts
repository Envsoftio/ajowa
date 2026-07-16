import * as XLSX from 'xlsx/xlsx.mjs'
import {
  computeDueAmounts,
  getCamAdvanceAdjustedDueDate,
  getDaysOverdue,
  getLateFeeStartDate,
  todayDate,
} from '~/server/utils/billing'
import { getDatabasePool } from '~/server/utils/database'
import { normalizeSocietySettings } from '~/server/utils/master-data'
import { createPdfBuffer, getSocietyStampImage } from '~/server/utils/pdf'
import { getSocietyInfo } from '~/server/utils/reports'
import type { BillingPeriodChargeType, ChargeBreakdownItem, DefaulterSummary } from '~/types/domain'

type DefaulterRow = {
  user_id: string
  auth_user_id: string | null
  resident_name: string
  resident_email: string | null
  resident_mobile_number: string | null
  flat_id: string
  flat_number: string
  block_id: string
  block_name: string
  relationship_type: string
  due_id: string
  due_status: string
  billing_period_id: string
  billing_period_label: string
  billing_period_charge_type: BillingPeriodChargeType
  billing_period_start_date: string
  billing_period_end_date: string
  base_amount: string
  waived_amount: string
  paid_amount: string
  due_date: string
  late_fee_starts_on: string | null
  charge_breakdown: ChargeBreakdownItem[] | null
  cam_advance_note: string | null
}

export type DefaulterFilters = {
  search: string
  billingPeriodId: string
  blockId: string
  chargeType: BillingPeriodChargeType | ''
  overdue: '' | 'not_overdue' | 'overdue' | 'recent' | 'aging' | 'escalated' | 'critical'
  balance: '' | 'small' | 'medium' | 'large'
  contact: '' | 'ready' | 'missing'
}

type DefaulterExportRow = {
  owner: string
  email: string
  mobile: string
  block: string
  flat: string
  period: string
  billType: string
  dueDate: string
  age: string
  totalAmount: number
  paidAmount: number
  balanceAmount: number
  status: string
  camAdvanceNote: string
}

const billingChargeTypes = new Set<string>(['CAM', 'DG_SET', 'GENERAL'])
const overdueFilters = new Set<string>([
  'not_overdue',
  'overdue',
  'recent',
  'aging',
  'escalated',
  'critical',
])
const balanceFilters = new Set<string>(['small', 'medium', 'large'])
const contactFilters = new Set<string>(['ready', 'missing'])

const defaultDefaulterFilters: DefaulterFilters = {
  search: '',
  billingPeriodId: '',
  blockId: '',
  chargeType: '',
  overdue: '',
  balance: '',
  contact: '',
}

const readQueryValue = (
  query: Record<string, unknown>,
  key: string,
) => {
  const value = query[key]
  const raw = Array.isArray(value) ? value[0] : value
  return raw == null ? '' : String(raw).trim()
}

export const parseDefaulterFilters = (
  query: Record<string, unknown>,
): DefaulterFilters => {
  const chargeType = readQueryValue(query, 'chargeType')
  const overdue = readQueryValue(query, 'overdue')
  const balance = readQueryValue(query, 'balance')
  const contact = readQueryValue(query, 'contact')

  return {
    search: readQueryValue(query, 'search').slice(0, 120),
    billingPeriodId: readQueryValue(query, 'billingPeriodId'),
    blockId: readQueryValue(query, 'blockId'),
    chargeType: billingChargeTypes.has(chargeType)
      ? chargeType as BillingPeriodChargeType
      : '',
    overdue: overdueFilters.has(overdue)
      ? overdue as DefaulterFilters['overdue']
      : '',
    balance: balanceFilters.has(balance)
      ? balance as DefaulterFilters['balance']
      : '',
    contact: contactFilters.has(contact)
      ? contact as DefaulterFilters['contact']
      : '',
  }
}

export const chargeTypeLabel = (value: string | null | undefined) => {
  if (value === 'CAM') return 'CAM'
  if (value === 'DG_SET') return 'DG Set'
  return 'General'
}

const overdueLabel = (days: number) =>
  days > 0 ? `${days} day${days === 1 ? '' : 's'}` : 'Not overdue'

const overdueBucketMatches = (
  daysOverdue: number,
  filter: DefaulterFilters['overdue'],
) => {
  if (filter === 'not_overdue') return daysOverdue === 0
  if (filter === 'overdue') return daysOverdue > 0
  if (filter === 'recent') return daysOverdue >= 1 && daysOverdue < 14
  if (filter === 'aging') return daysOverdue >= 14 && daysOverdue < 30
  if (filter === 'escalated') return daysOverdue >= 30 && daysOverdue < 45
  if (filter === 'critical') return daysOverdue >= 45
  return true
}

const balanceBucketMatches = (
  balanceAmount: number,
  filter: DefaulterFilters['balance'],
) => {
  if (filter === 'small') return balanceAmount <= 5000
  if (filter === 'medium') return balanceAmount > 5000 && balanceAmount <= 15000
  if (filter === 'large') return balanceAmount > 15000
  return true
}

const hasReminderContact = (row: DefaulterSummary) => Boolean(row.residentEmail)

const flatSearchText = (flat: DefaulterSummary['flats'][number]) =>
  [
    flat.blockName,
    flat.flatNumber,
    flat.billingPeriodLabel,
    chargeTypeLabel(flat.billingPeriodChargeType),
  ]
    .join(' ')
    .toLowerCase()

const flatMatchesFilters = (
  flat: DefaulterSummary['flats'][number],
  filters: DefaulterFilters,
) => {
  if (
    filters.billingPeriodId &&
    flat.billingPeriodId !== filters.billingPeriodId
  ) {
    return false
  }

  if (filters.blockId && flat.blockId !== filters.blockId) {
    return false
  }

  if (
    filters.chargeType &&
    flat.billingPeriodChargeType !== filters.chargeType
  ) {
    return false
  }

  return (
    overdueBucketMatches(flat.daysOverdue, filters.overdue) &&
    balanceBucketMatches(flat.balanceAmount, filters.balance)
  )
}

const summarizeDefaulter = (
  row: DefaulterSummary,
  flats: DefaulterSummary['flats'],
): DefaulterSummary => ({
  ...row,
  flatCount: new Set(flats.map((flat) => flat.flatId)).size,
  flats,
  totalDue: flats.reduce((sum, flat) => sum + flat.totalAmount, 0),
  totalPaid: flats.reduce((sum, flat) => sum + flat.paidAmount, 0),
  totalBalance: flats.reduce((sum, flat) => sum + flat.balanceAmount, 0),
  maxDaysOverdue: flats.reduce(
    (max, flat) => Math.max(max, flat.daysOverdue),
    0,
  ),
})

export const filterDefaulters = (
  rows: DefaulterSummary[],
  filters: DefaulterFilters,
) => {
  const term = filters.search.trim().toLowerCase()

  return rows
    .map((row) => {
      if (filters.contact === 'ready' && !hasReminderContact(row)) {
        return null
      }

      if (filters.contact === 'missing' && hasReminderContact(row)) {
        return null
      }

      const matchingFlats = row.flats.filter((flat) =>
        flatMatchesFilters(flat, filters),
      )
      if (matchingFlats.length === 0) {
        return null
      }

      if (!term) return summarizeDefaulter(row, matchingFlats)

      const flatText = matchingFlats.map(flatSearchText).join(' ')
      const ownerText = [
        row.residentName,
        row.residentEmail,
        row.residentMobileNumber,
      ]
        .join(' ')
        .toLowerCase()

      return `${ownerText} ${flatText}`.includes(term)
        ? summarizeDefaulter(row, matchingFlats)
        : null
    })
    .filter((row): row is DefaulterSummary => Boolean(row))
    .sort(
      (a, b) =>
        b.maxDaysOverdue - a.maxDaysOverdue ||
        b.totalBalance - a.totalBalance ||
        a.residentName.localeCompare(b.residentName),
    )
}

export const listDefaulters = async ({
  societyId,
  filters = defaultDefaulterFilters,
}: {
  societyId: string
  filters?: DefaulterFilters
}) => {
  const pool = getDatabasePool()
  const today = todayDate()

  const societyResult = await pool.query<{ settings: Record<string, unknown> }>(
    `select settings from society_profile where id = $1 limit 1`,
    [societyId],
  )
  const settings = normalizeSocietySettings(societyResult.rows[0]?.settings)

  const result = await pool.query<DefaulterRow>(
    `
      select
        owner.id as user_id,
        owner.auth_user_id,
        owner.full_name as resident_name,
        owner.email as resident_email,
        owner.mobile_number as resident_mobile_number,
        f.id as flat_id,
        f.flat_number,
        f.block_id,
        b.name as block_name,
        owner.relationship_type::text,
        md.id as due_id,
        md.status::text as due_status,
        bp.id as billing_period_id,
        bp.label as billing_period_label,
        bp.charge_type::text as billing_period_charge_type,
        bp.start_date::text as billing_period_start_date,
        bp.end_date::text as billing_period_end_date,
        md.base_amount::text,
        md.waived_amount::text,
        md.paid_amount::text,
        md.due_date::text,
        md.late_fee_starts_on::text,
        md.charge_breakdown,
        (
          select item->>'camAdvanceNote'
          from jsonb_array_elements(
            case
              when jsonb_typeof(md.charge_breakdown) = 'array' then md.charge_breakdown
              else '[]'::jsonb
            end
          ) item
          where item ? 'camAdvanceNote'
          limit 1
        ) as cam_advance_note
      from maintenance_dues md
      inner join flats f on f.id = md.flat_id
      inner join blocks b on b.id = f.block_id
      inner join billing_periods bp on bp.id = md.billing_period_id
      inner join lateral (
        select
          u.id,
          u.auth_user_id,
          u.full_name,
          coalesce(
            nullif(btrim(u.email::text), ''),
            case
              when fr.import_metadata->>'relationshipSource' = 'OWNER'
                and upper(coalesce(btrim(fr.import_metadata #>> '{sourceData,EMAIL ID}'), '')) not in ('', 'NA', 'N/A', 'NIL', '-', '--')
              then btrim(fr.import_metadata #>> '{sourceData,EMAIL ID}')
              else null
            end
          ) as email,
          u.mobile_number,
          fr.relationship_type
        from flat_residents fr
        inner join users u on u.id = fr.user_id
        where fr.flat_id = md.flat_id
          and fr.is_active = true
          and fr.relationship_type = 'OWNER'
          and u.is_active = true
        order by
          fr.is_billing_contact desc,
          fr.is_primary_contact desc,
          fr.created_at asc
        limit 1
      ) owner on true
      where md.society_id = $1
        and md.status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE')
        and md.balance_amount > 0
      order by md.balance_amount desc, b.name, f.flat_number
    `,
    [societyId],
  )

  const userMap = new Map<string, DefaulterSummary>()

  for (const row of result.rows) {
    const existing = userMap.get(row.user_id)
    const chargeBreakdown = Array.isArray(row.charge_breakdown) ? row.charge_breakdown : []
    const effectiveDueDate = getCamAdvanceAdjustedDueDate({
      dueDate: row.due_date,
      billingPeriodChargeType: row.billing_period_charge_type,
      billingPeriodStartDate: row.billing_period_start_date,
      billingPeriodEndDate: row.billing_period_end_date,
      chargeBreakdown,
    })
    const defaultLateFeeStartsOn = getLateFeeStartDate(effectiveDueDate, settings.graceDays)
    const effectiveLateFeeStartsOn = row.late_fee_starts_on
      ? row.late_fee_starts_on >= defaultLateFeeStartsOn
        ? row.late_fee_starts_on
        : defaultLateFeeStartsOn
      : null
    const computed = computeDueAmounts(
      {
        dueDate: effectiveDueDate,
        lateFeeStartsOn: effectiveLateFeeStartsOn,
        baseAmount: Number(row.base_amount),
        waivedAmount: Number(row.waived_amount),
        paidAmount: Number(row.paid_amount),
        storedStatus: row.due_status,
      },
      today,
      settings.graceDays,
      settings.lateFeePerDay,
    )

    const daysOverdue = getDaysOverdue(
      effectiveDueDate,
      today,
      settings.graceDays,
      effectiveLateFeeStartsOn,
    )
    if (
      computed.balanceAmount <= 0 ||
      ['PAID', 'WAIVED', 'CANCELLED'].includes(computed.status)
    ) {
      continue
    }

    const flatInfo = {
      flatId: row.flat_id,
      flatNumber: row.flat_number,
      blockId: row.block_id,
      blockName: row.block_name,
      relationshipType: row.relationship_type,
      dueId: row.due_id,
      dueStatus: computed.status,
      billingPeriodId: row.billing_period_id,
      billingPeriodLabel: row.billing_period_label,
      billingPeriodChargeType: row.billing_period_charge_type,
      dueDate: row.due_date,
      totalAmount: computed.totalAmount,
      paidAmount: Number(row.paid_amount),
      balanceAmount: computed.balanceAmount,
      daysOverdue,
      camAdvanceNote: row.cam_advance_note,
    }

    if (existing) {
      existing.flats.push(flatInfo)
      existing.flatCount = new Set(
        existing.flats.map((flat) => flat.flatId),
      ).size
      existing.totalDue += flatInfo.totalAmount
      existing.totalPaid += flatInfo.paidAmount
      existing.totalBalance += flatInfo.balanceAmount
      existing.maxDaysOverdue = Math.max(
        existing.maxDaysOverdue,
        flatInfo.daysOverdue,
      )
    } else {
      userMap.set(row.user_id, {
        userId: row.user_id,
        authUserId: row.auth_user_id,
        residentName: row.resident_name,
        residentEmail: row.resident_email,
        residentMobileNumber: row.resident_mobile_number,
        flatCount: 1,
        flats: [flatInfo],
        totalDue: flatInfo.totalAmount,
        totalPaid: flatInfo.paidAmount,
        totalBalance: flatInfo.balanceAmount,
        maxDaysOverdue: flatInfo.daysOverdue,
      })
    }
  }

  return filterDefaulters(Array.from(userMap.values()), filters)
}

const formatMoney = (value: number) =>
  `INR ${new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(value)}`

const formatDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    dateStyle: 'medium',
  })

const flattenDefaulterRows = (
  defaulters: DefaulterSummary[],
): DefaulterExportRow[] =>
  defaulters.flatMap((row) =>
    row.flats.map((flat) => ({
      owner: row.residentName,
      email: row.residentEmail ?? '',
      mobile: row.residentMobileNumber ?? '',
      block: flat.blockName,
      flat: `${flat.blockName} ${flat.flatNumber}`,
      period: flat.billingPeriodLabel,
      billType: chargeTypeLabel(flat.billingPeriodChargeType),
      dueDate: formatDate(flat.dueDate),
      age: overdueLabel(flat.daysOverdue),
      totalAmount: flat.totalAmount,
      paidAmount: flat.paidAmount,
      balanceAmount: flat.balanceAmount,
      status: flat.dueStatus,
      camAdvanceNote: flat.camAdvanceNote ?? '',
    })),
  )

const summarizeDefaulters = (defaulters: DefaulterSummary[]) => {
  const dues = defaulters.flatMap((row) => row.flats)

  return {
    owners: defaulters.length,
    flats: defaulters.reduce((sum, row) => sum + row.flatCount, 0),
    dues: dues.length,
    overdueDues: dues.filter((flat) => flat.daysOverdue > 0).length,
    emailReady: defaulters.filter(hasReminderContact).length,
    totalDue: defaulters.reduce((sum, row) => sum + row.totalDue, 0),
    totalPaid: defaulters.reduce((sum, row) => sum + row.totalPaid, 0),
    totalBalance: defaulters.reduce((sum, row) => sum + row.totalBalance, 0),
    maxDaysOverdue: defaulters.reduce(
      (max, row) => Math.max(max, row.maxDaysOverdue),
      0,
    ),
  }
}

const describeDefaulterFilters = (
  filters: DefaulterFilters,
  defaulters: DefaulterSummary[] = [],
) => {
  const flats = defaulters.flatMap((row) => row.flats)
  const periodLabel = filters.billingPeriodId
    ? flats.find((flat) => flat.billingPeriodId === filters.billingPeriodId)
      ?.billingPeriodLabel ?? filters.billingPeriodId
    : ''
  const blockLabel = filters.blockId
    ? flats.find((flat) => flat.blockId === filters.blockId)?.blockName ??
      filters.blockId
    : ''
  const descriptions = [
    filters.search ? `Search: ${filters.search}` : '',
    periodLabel ? `Period: ${periodLabel}` : '',
    blockLabel ? `Block: ${blockLabel}` : '',
    filters.chargeType ? `Bill type: ${chargeTypeLabel(filters.chargeType)}` : '',
    filters.overdue ? `Overdue age: ${filters.overdue.replaceAll('_', ' ')}` : '',
    filters.balance ? `Balance: ${filters.balance}` : '',
    filters.contact ? `Email: ${filters.contact}` : '',
  ].filter(Boolean)

  return descriptions.length > 0 ? descriptions.join(' | ') : 'All unpaid dues'
}

export const buildDefaulterExportFilename = (extension: 'pdf' | 'xlsx') =>
  `defaulters-${new Date().toISOString().slice(0, 10)}.${extension}`

export const buildDefaulterWorkbook = (
  defaulters: DefaulterSummary[],
  filters: DefaulterFilters,
) => {
  const workbook = XLSX.utils.book_new()
  const summary = summarizeDefaulters(defaulters)
  const exportRows = flattenDefaulterRows(defaulters)
  const headers = [
    'Owner',
    'Email',
    'Mobile',
    'Block',
    'Flat',
    'Period',
    'Bill type',
    'Due date',
    'Age',
    'Total amount',
    'Paid amount',
    'Balance amount',
    'Status',
    'CAM advance note',
  ]
  const rows = exportRows.map((row) => [
    row.owner,
    row.email,
    row.mobile,
    row.block,
    row.flat,
    row.period,
    row.billType,
    row.dueDate,
    row.age,
    row.totalAmount,
    row.paidAmount,
    row.balanceAmount,
    row.status,
    row.camAdvanceNote,
  ])
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  worksheet['!cols'] = [
    { wch: 24 },
    { wch: 28 },
    { wch: 16 },
    { wch: 12 },
    { wch: 14 },
    { wch: 24 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 32 },
  ]

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['Generated at', new Date().toISOString()],
    ['Filters', describeDefaulterFilters(filters, defaulters)],
    ['Owners', summary.owners],
    ['Flats', summary.flats],
    ['Dues', summary.dues],
    ['Overdue dues', summary.overdueDues],
    ['Email ready owners', summary.emailReady],
    ['Total due', summary.totalDue],
    ['Total paid', summary.totalPaid],
    ['Total balance', summary.totalBalance],
    ['Oldest overdue days', summary.maxDaysOverdue],
  ])
  summarySheet['!cols'] = [{ wch: 22 }, { wch: 60 }]

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Defaulters')

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

export const buildDefaulterPdf = async (
  defaulters: DefaulterSummary[],
  societyId: string,
  filters: DefaulterFilters,
) => {
  const society = await getSocietyInfo(societyId)
  const stampImage = getSocietyStampImage()
  const summary = summarizeDefaulters(defaulters)
  const exportRows = flattenDefaulterRows(defaulters)
  const body: unknown[][] = [
    [
      { text: 'Owner', style: 'tableHeader' },
      { text: 'Contact', style: 'tableHeader' },
      { text: 'Flat', style: 'tableHeader' },
      { text: 'Period', style: 'tableHeader' },
      { text: 'Due date', style: 'tableHeader' },
      { text: 'Age', style: 'tableHeader' },
      { text: 'Balance', style: 'tableHeader' },
      { text: 'Status', style: 'tableHeader' },
    ],
    ...exportRows.map((row) => [
      { text: row.owner, style: 'tableCell' },
      {
        text: [row.email, row.mobile].filter(Boolean).join('\n') || '-',
        style: 'tableCell',
      },
      { text: row.flat, style: 'tableCell' },
      {
        text: `${row.period}\n${row.billType}`,
        style: 'tableCell',
      },
      { text: row.dueDate, style: 'tableCell' },
      { text: row.age, style: 'tableCell' },
      { text: formatMoney(row.balanceAmount), style: 'tableCell' },
      { text: row.status, style: 'tableCell' },
    ]),
  ]

  if (body.length === 1) {
    body.push([
      {
        text: 'No unpaid owner dues found for the selected filters.',
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
  }

  return await createPdfBuffer({
    pageOrientation: 'landscape',
    pageMargins: [28, 42, 28, 36],
    content: [
      { text: society.name, style: 'brand' },
      { text: society.address, style: 'subtle' },
      { text: 'Defaulter List', style: 'title' },
      {
        text:
          `Generated ${new Date().toISOString()} | ` +
          `${summary.owners} owners | ${summary.dues} dues | ` +
          `Balance ${formatMoney(summary.totalBalance)}`,
        style: 'subtle',
      },
      {
        text: `Filters: ${describeDefaulterFilters(filters, defaulters)}`,
        style: 'subtle',
        margin: [0, 2, 0, 12],
      },
      {
        table: {
          headerRows: 1,
          widths: ['15%', '17%', '10%', '15%', '10%', '10%', '13%', '10%'],
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
            text: 'This is a system-generated unpaid dues report.',
            style: 'footerNote',
            alignment: 'right',
          },
        ],
        columnGap: 16,
        margin: [0, 16, 0, 0],
      },
    ],
    styles: {
      brand: {
        fontSize: 10,
        color: '#0f766e',
        bold: true,
        margin: [0, 0, 0, 4],
      },
      title: {
        fontSize: 18,
        bold: true,
        color: '#2f4050',
        margin: [0, 10, 0, 4],
      },
      subtle: { fontSize: 8, color: '#768390' },
      tableHeader: {
        bold: true,
        fontSize: 8,
        color: '#ffffff',
        fillColor: '#2a3f54',
      },
      tableCell: { fontSize: 7, color: '#2f4050' },
      signature: { fontSize: 8, color: '#111827', bold: true },
      footerNote: { fontSize: 8, color: '#768390', italics: true },
    },
    defaultStyle: { font: 'Roboto' },
  })
}
