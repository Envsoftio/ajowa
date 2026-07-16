import * as XLSX from 'xlsx/xlsx.mjs'
import { createEventError, setEventHeader } from '~/server/utils/http-event'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import {
  getQuerySafe,
  parseListQuery,
  relationshipTypes,
} from '~/server/utils/master-data'
import { createPdfBuffer } from '~/server/utils/pdf'
import { getSocietyInfo } from '~/server/utils/reports'

type ExportFormat = 'pdf' | 'xlsx'

type ResidentExportRow = {
  id: string
  full_name: string
  email: string | null
  source_email: string | null
  mobile_number: string | null
  source_contact: string | null
  whatsapp_number: string | null
  can_login: boolean
  email_verified: boolean
  is_active: boolean
  kyc_status: string
  police_verification_status: string
  profession_name: string | null
  profession_is_public: boolean | null
  relationship_types: string | null
  flat_labels: string | null
  flat_count: string
  active_relationship_count: string
  created_at: string
  updated_at: string
}

type FilterLabels = {
  flat?: string
  profession?: string
}

const residentExportLimit = 10000

const sourceEmailSql = `
  max(
    case
      when fr.import_metadata->>'relationshipSource' = 'OWNER'
        and upper(coalesce(btrim(fr.import_metadata #>> '{sourceData,EMAIL ID}'), '')) not in ('', 'NA', 'N/A', '--', 'NIL')
        then btrim(fr.import_metadata #>> '{sourceData,EMAIL ID}')
      else null
    end
  )::text
`

const sourceContactSql = `
  max(
    case
      when fr.import_metadata->>'relationshipSource' = 'OWNER'
        and upper(coalesce(btrim(fr.import_metadata #>> '{sourceData,CONTACT DETAILS}'), '')) not in ('', 'NA', 'N/A', '--', 'NIL')
        then btrim(fr.import_metadata #>> '{sourceData,CONTACT DETAILS}')
      else null
    end
  )::text
`

const sortColumns: Record<string, string> = {
  fullName: 'u.full_name',
  email: `coalesce(u.email::text, ${sourceEmailSql})`,
  canLogin: 'u.can_login',
  isActive: 'u.is_active',
  kycStatus: 'u.kyc_status',
  createdAt: 'u.created_at',
}

const queryText = (value: unknown) => {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first.trim() : ''
}

const getExportFormat = (query: Record<string, unknown>): ExportFormat => {
  const format = (
    queryText(query.format) ||
    queryText(query.export) ||
    'pdf'
  ).toLowerCase()

  if (format === 'pdf' || format === 'xlsx' || format === 'excel') {
    return format === 'pdf' ? 'pdf' : 'xlsx'
  }

  throw createEventError({
    statusCode: 400,
    message: 'Unsupported resident export format.',
  })
}

const getExportFileName = (format: ExportFormat) =>
  `residents-${new Date().toISOString().slice(0, 10)}.${format}`

const formatBoolean = (value: boolean | null | undefined) =>
  value ? 'Yes' : 'No'

const formatStatus = (value: string | null | undefined) =>
  value ? value.replaceAll('_', ' ') : '-'

const formatRelationshipTypes = (value: string | null | undefined) =>
  value
    ?.split(', ')
    .filter(Boolean)
    .map(formatStatus)
    .join(', ') || '-'

const formatContact = (row: ResidentExportRow) =>
  [
    row.email || row.source_email || '',
    row.mobile_number || row.source_contact || '',
  ]
    .filter(Boolean)
    .join('\n') || '-'

const buildFilterSql = (
  societyId: string,
  query: ReturnType<typeof parseListQuery>,
) => {
  const where: string[] = ['u.society_id = $1', `u.role = 'RESIDENT'`]
  const values: unknown[] = [societyId]

  if (query.search) {
    values.push(`%${query.search}%`)
    where.push(
      `(
        u.full_name ilike $${values.length}
        or coalesce(u.email::text, '') ilike $${values.length}
        or coalesce(u.mobile_number, '') ilike $${values.length}
        or exists (
          select 1
          from flat_residents search_fr
          where search_fr.user_id = u.id
            and search_fr.import_metadata->>'relationshipSource' = 'OWNER'
            and (
              coalesce(search_fr.import_metadata #>> '{sourceData,EMAIL ID}', '') ilike $${values.length}
              or coalesce(search_fr.import_metadata #>> '{sourceData,CONTACT DETAILS}', '') ilike $${values.length}
            )
        )
      )`,
    )
  }

  const activeFilter = query.filters.isActive?.[0]
  if (activeFilter === 'true' || activeFilter === 'false') {
    values.push(activeFilter === 'true')
    where.push(`u.is_active = $${values.length}`)
  }

  const loginFilter = query.filters.canLogin?.[0]
  if (loginFilter === 'true' || loginFilter === 'false') {
    values.push(loginFilter === 'true')
    where.push(`u.can_login = $${values.length}`)
  }

  const relationshipTypeFilter = query.filters.relationshipType?.[0]
  const hasRelationshipTypeFilter = relationshipTypes.includes(
    relationshipTypeFilter as (typeof relationshipTypes)[number],
  )

  const flatFilter = query.filters.flatId?.[0]
  if (flatFilter) {
    values.push(flatFilter)
    const flatParam = values.length
    let relationshipCondition = ''

    if (hasRelationshipTypeFilter) {
      values.push(relationshipTypeFilter)
      relationshipCondition = `and filter_fr.relationship_type = $${values.length}::relationship_type`
    }

    where.push(`
      exists (
        select 1
        from flat_residents filter_fr
        inner join flats filter_f on filter_f.id = filter_fr.flat_id
        where filter_fr.user_id = u.id
          and filter_f.society_id = u.society_id
          and filter_f.id = $${flatParam}
          ${relationshipCondition}
      )
    `)
  } else if (hasRelationshipTypeFilter) {
    values.push(relationshipTypeFilter)
    where.push(`
      exists (
        select 1
        from flat_residents filter_fr
        inner join flats filter_f on filter_f.id = filter_fr.flat_id
        where filter_fr.user_id = u.id
          and filter_f.society_id = u.society_id
          and filter_fr.relationship_type = $${values.length}::relationship_type
      )
    `)
  }

  const professionFilter = query.filters.professionId?.[0]
  if (professionFilter) {
    values.push(professionFilter)
    where.push(`
      exists (
        select 1
        from resident_profession_profiles filter_rpp
        where filter_rpp.user_id = u.id
          and filter_rpp.society_id = u.society_id
          and filter_rpp.is_active = true
          and filter_rpp.profession_id = $${values.length}
      )
    `)
  }

  return {
    whereSql: where.join(' and '),
    values,
  }
}

const getFilterLabels = async (
  societyId: string,
  query: ReturnType<typeof parseListQuery>,
) => {
  const pool = getDatabasePool()
  const flatId = query.filters.flatId?.[0]
  const professionId = query.filters.professionId?.[0]
  const labels: FilterLabels = {}

  const [flatResult, professionResult] = await Promise.all([
    flatId
      ? pool.query<{ label: string }>(
          `
            select concat(b.name, ' ', f.flat_number) as label
            from flats f
            inner join blocks b on b.id = f.block_id
            where f.society_id = $1 and f.id = $2
            limit 1
          `,
          [societyId, flatId],
        )
      : Promise.resolve({ rows: [] }),
    professionId
      ? pool.query<{ name: string }>(
          `
            select name
            from professions
            where society_id = $1 and id = $2
            limit 1
          `,
          [societyId, professionId],
        )
      : Promise.resolve({ rows: [] }),
  ])

  if (flatResult.rows[0]?.label) {
    labels.flat = flatResult.rows[0].label
  }

  if (professionResult.rows[0]?.name) {
    labels.profession = professionResult.rows[0].name
  }

  return labels
}

const describeFilters = (
  query: ReturnType<typeof parseListQuery>,
  labels: FilterLabels,
) => {
  const activeFilter = query.filters.isActive?.[0]
  const loginFilter = query.filters.canLogin?.[0]
  const relationshipTypeFilter = query.filters.relationshipType?.[0]
  const parts = [
    query.search ? `Search: ${query.search}` : '',
    query.filters.flatId?.[0]
      ? `Flat: ${labels.flat ?? query.filters.flatId[0]}`
      : '',
    relationshipTypeFilter
      ? `Type: ${formatStatus(relationshipTypeFilter)}`
      : '',
    query.filters.professionId?.[0]
      ? `Profession: ${labels.profession ?? query.filters.professionId[0]}`
      : '',
    loginFilter === 'true'
      ? 'Login: Enabled'
      : loginFilter === 'false'
        ? 'Login: Disabled'
        : '',
    activeFilter === 'true'
      ? 'Status: Active'
      : activeFilter === 'false'
        ? 'Status: Inactive'
        : '',
  ].filter(Boolean)

  return parts.length ? parts.join(' | ') : 'All residents'
}

const toWorkbookRow = (row: ResidentExportRow) => ({
  Resident: row.full_name,
  Types: formatRelationshipTypes(row.relationship_types),
  Flats: row.flat_labels ?? '-',
  Email: row.email ?? '',
  'Imported email': row.source_email ?? '',
  Mobile: row.mobile_number ?? '',
  'Imported contact': row.source_contact ?? '',
  WhatsApp: row.whatsapp_number ?? '',
  Profession: row.profession_name ?? '',
  'Profession public': formatBoolean(row.profession_is_public),
  'Login enabled': formatBoolean(row.can_login),
  'Email verified': formatBoolean(row.email_verified),
  Active: formatBoolean(row.is_active),
  'KYC status': formatStatus(row.kyc_status),
  'Police verification': formatStatus(row.police_verification_status),
  'Flat count': Number(row.flat_count),
  'Active relationships': Number(row.active_relationship_count),
  'Created at': row.created_at,
  'Updated at': row.updated_at,
})

const buildWorkbook = (
  rows: ResidentExportRow[],
  total: number,
  filters: string,
) => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet(
    rows.length
      ? rows.map(toWorkbookRow)
      : [{ Note: 'No residents found for the selected filters.' }],
  )
  worksheet['!cols'] = [
    { wch: 28 },
    { wch: 22 },
    { wch: 28 },
    { wch: 30 },
    { wch: 30 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 24 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
    { wch: 20 },
  ]

  const summarySheet = XLSX.utils.json_to_sheet([
    { Metric: 'Report', Value: 'Resident Details' },
    { Metric: 'Filters', Value: filters },
    { Metric: 'Generated at', Value: new Date().toISOString() },
    { Metric: 'Matching residents', Value: total },
    { Metric: 'Exported residents', Value: rows.length },
    { Metric: 'Export limit', Value: residentExportLimit },
  ])
  summarySheet['!cols'] = [{ wch: 24 }, { wch: 70 }]

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Residents')

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

const buildPdf = async (
  rows: ResidentExportRow[],
  total: number,
  filters: string,
  societyId: string,
) => {
  const society = await getSocietyInfo(societyId)
  const body: unknown[][] = [
    [
      { text: 'Resident', style: 'tableHeader' },
      { text: 'Type', style: 'tableHeader' },
      { text: 'Flat', style: 'tableHeader' },
      { text: 'Contact', style: 'tableHeader' },
      { text: 'Profession', style: 'tableHeader' },
      { text: 'Login', style: 'tableHeader' },
      { text: 'Active', style: 'tableHeader' },
      { text: 'Verification', style: 'tableHeader' },
    ],
    ...rows.map((row) => [
      { text: row.full_name, style: 'tableCell' },
      { text: formatRelationshipTypes(row.relationship_types), style: 'tableCell' },
      { text: row.flat_labels ?? '-', style: 'tableCell' },
      { text: formatContact(row), style: 'tableCell' },
      { text: row.profession_name ?? '-', style: 'tableCell' },
      { text: formatBoolean(row.can_login), style: 'tableCell' },
      { text: formatBoolean(row.is_active), style: 'tableCell' },
      {
        text: `KYC: ${formatStatus(row.kyc_status)}\nPolice: ${formatStatus(row.police_verification_status)}`,
        style: 'tableCell',
      },
    ]),
  ]

  if (body.length === 1) {
    body.push([
      {
        text: 'No residents found for the selected filters.',
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
      { text: 'Resident Details', style: 'title' },
      {
        text: `Generated ${new Date().toISOString()} | Matching residents: ${total} | Exported: ${rows.length}`,
        style: 'subtle',
      },
      {
        text: `Filters: ${filters}`,
        style: 'subtle',
        margin: [0, 2, 0, 12],
      },
      {
        table: {
          headerRows: 1,
          widths: ['16%', '11%', '14%', '17%', '13%', '7%', '7%', '15%'],
          body,
        },
        layout: 'lightHorizontalLines',
      },
      {
        text:
          total > rows.length
            ? `Rows exported: ${rows.length} of ${total}. Narrow the filters to export a smaller resident list.`
            : `Rows exported: ${rows.length}`,
        style: 'footerNote',
        margin: [0, 10, 0, 0],
      },
      {
        text: 'This is a system-generated resident registry export.',
        style: 'footerNote',
        alignment: 'right',
        margin: [0, 14, 0, 0],
      },
    ],
    styles: {
      brand: { fontSize: 10, color: '#0f766e', bold: true, margin: [0, 0, 0, 4] },
      title: { fontSize: 18, bold: true, color: '#2f4050', margin: [0, 10, 0, 4] },
      subtle: { fontSize: 8, color: '#768390' },
      tableHeader: { bold: true, fontSize: 8, color: '#ffffff', fillColor: '#2a3f54' },
      tableCell: { fontSize: 7, color: '#2f4050' },
      footerNote: { fontSize: 8, color: '#768390', italics: true },
    },
    defaultStyle: { font: 'Roboto' },
  })
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const rawQuery = getQuerySafe(event)
  const query = parseListQuery(event)
  const format = getExportFormat(rawQuery)
  const pool = getDatabasePool()
  const filterSql = buildFilterSql(authMe.user.societyId, query)
  const labels = await getFilterLabels(authMe.user.societyId, query)
  const filters = describeFilters(query, labels)
  const orderBy = sortColumns[query.sortBy ?? 'fullName'] ?? 'u.full_name'
  const direction = query.sortDirection === 'desc' ? 'desc' : 'asc'

  const [countResult, dataResult] = await Promise.all([
    pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from users u
        where ${filterSql.whereSql}
      `,
      filterSql.values,
    ),
    pool.query<ResidentExportRow>(
      `
        select
          u.id,
          u.full_name,
          u.email::text,
          ${sourceEmailSql} as source_email,
          u.mobile_number,
          ${sourceContactSql} as source_contact,
          u.whatsapp_number,
          u.can_login,
          u.email_verified,
          u.is_active,
          u.kyc_status::text,
          u.police_verification_status::text,
          profession.profession_name,
          profession.profession_is_public,
          string_agg(distinct fr.relationship_type::text, ', ' order by fr.relationship_type::text) as relationship_types,
          string_agg(distinct concat(b.name, ' ', f.flat_number), ', ' order by concat(b.name, ' ', f.flat_number)) as flat_labels,
          count(distinct fr.flat_id)::text as flat_count,
          count(fr.id) filter (where fr.is_active = true)::text as active_relationship_count,
          u.created_at::text,
          u.updated_at::text
        from users u
        left join flat_residents fr on fr.user_id = u.id
        left join flats f on f.id = fr.flat_id
        left join blocks b on b.id = f.block_id
        left join lateral (
          select
            p.name as profession_name,
            rpp.is_public as profession_is_public
          from resident_profession_profiles rpp
          inner join professions p on p.id = rpp.profession_id
          where rpp.user_id = u.id
            and rpp.society_id = u.society_id
            and rpp.is_active = true
          limit 1
        ) profession on true
        where ${filterSql.whereSql}
        group by u.id, profession.profession_name, profession.profession_is_public
        order by ${orderBy} ${direction}, u.full_name asc
        limit $${filterSql.values.length + 1}
      `,
      [...filterSql.values, residentExportLimit],
    ),
  ])

  const total = Number(countResult.rows[0]?.count ?? 0)
  const fileName = getExportFileName(format)

  setEventHeader(event, 'cache-control', 'private, no-store')
  setEventHeader(event, 'x-export-total', String(total))
  setEventHeader(event, 'x-export-count', String(dataResult.rows.length))

  if (format === 'pdf') {
    setEventHeader(event, 'content-type', 'application/pdf')
    setEventHeader(
      event,
      'content-disposition',
      `attachment; filename="${fileName}"`,
    )

    return await buildPdf(
      dataResult.rows,
      total,
      filters,
      authMe.user.societyId,
    )
  }

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

  return buildWorkbook(dataResult.rows, total, filters)
})
