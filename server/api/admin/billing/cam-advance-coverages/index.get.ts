import * as XLSX from 'xlsx/xlsx.mjs'
import { createPaginatedSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getQuerySafe, parseListQuery } from '~/server/utils/master-data'
import { setEventHeader } from '~/server/utils/http-event'
import type { CamAdvanceCoverage } from '~/types/domain'

type CoverageRow = {
  id: string
  society_id: string
  flat_id: string
  flat_number: string
  block_name: string
  unit_type: string
  covered_from: string
  covered_until: string
  amount: string | null
  source: CamAdvanceCoverage['source']
  reference: string | null
  notes: string | null
  is_active: boolean
  primary_resident_name: string | null
  created_at: string
  updated_at: string
}

const flatNumberSortExpression =
  "coalesce(nullif(regexp_replace(f.flat_number, '\\D', '', 'g'), '')::integer, 2147483647)"

const sortColumns: Record<string, string> = {
  flatNumber: flatNumberSortExpression,
  coveredFrom: 'cac.covered_from',
  coveredUntil: 'cac.covered_until',
  source: 'cac.source',
  amount: 'cac.amount',
  updatedAt: 'cac.updated_at',
}

const mapCoverage = (row: CoverageRow): CamAdvanceCoverage => ({
  id: row.id,
  societyId: row.society_id,
  flatId: row.flat_id,
  flatNumber: row.flat_number,
  blockName: row.block_name,
  unitType: row.unit_type,
  coveredFrom: row.covered_from,
  coveredUntil: row.covered_until,
  amount: row.amount == null ? null : Number(row.amount),
  source: row.source,
  reference: row.reference,
  notes: row.notes,
  isActive: row.is_active,
  primaryResidentName: row.primary_resident_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const exportLimit = 10000

const buildCoverageWorkbook = (
  items: CamAdvanceCoverage[],
  total: number,
  filters: {
    search: string | undefined
    state: string | undefined
    source: string | undefined
  },
) => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet(
    items.length
      ? items.map((item) => ({
          Block: item.blockName,
          Flat: item.flatNumber,
          'Unit type': item.unitType,
          'Billing contact': item.primaryResidentName ?? '',
          'Covered from': item.coveredFrom,
          'Covered until': item.coveredUntil,
          Amount: item.amount ?? '',
          Source: item.source,
          Reference: item.reference ?? '',
          Notes: item.notes ?? '',
          State: item.isActive ? 'Active' : 'Inactive',
          'Created at': item.createdAt,
          'Updated at': item.updatedAt,
        }))
      : [{ Note: 'No CAM advance records found for the selected filters.' }],
  )
  const summary = XLSX.utils.json_to_sheet([
    { Metric: 'Report', Value: 'CAM advance coverage' },
    { Metric: 'Search', Value: filters.search ?? '' },
    { Metric: 'State', Value: filters.state || 'All records' },
    { Metric: 'Source', Value: filters.source || 'All sources' },
    { Metric: 'Matching rows', Value: total },
    { Metric: 'Exported rows', Value: items.length },
    { Metric: 'Export limit', Value: exportLimit },
    {
      Metric: 'Export note',
      Value:
        total > items.length
          ? `Exported first ${items.length} of ${total} matching rows. Narrow filters to export a smaller set.`
          : 'All matching rows exported.',
    },
    {
      Metric: 'Exported amount',
      Value: items.reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
    },
    { Metric: 'Generated at', Value: new Date().toISOString() },
  ])
  XLSX.utils.book_append_sheet(workbook, worksheet, 'CAM Advance')
  XLSX.utils.book_append_sheet(workbook, summary, 'Summary')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const rawQuery = getQuerySafe(event)
  const query = parseListQuery(event)
  const pool = getDatabasePool()
  const where: string[] = ['cac.society_id = $1']
  const values: unknown[] = [authMe.user.societyId]

  if (query.search) {
    values.push(`%${query.search}%`)
    where.push(
      `(f.flat_number ilike $${values.length} or b.name ilike $${values.length} or u.full_name ilike $${values.length} or cac.reference ilike $${values.length})`,
    )
  }

  const flatFilter = query.filters.flatId?.[0]
  if (flatFilter) {
    values.push(flatFilter)
    where.push(`cac.flat_id = $${values.length}`)
  }

  const sourceFilter = query.filters.source?.[0]
  if (sourceFilter) {
    values.push(sourceFilter)
    where.push(`cac.source = $${values.length}`)
  }

  const stateFilter = query.filters.state?.[0]
  if (stateFilter === 'active') {
    where.push('cac.is_active = true')
  } else if (stateFilter === 'inactive') {
    where.push('cac.is_active = false')
  } else if (stateFilter === 'current') {
    where.push(
      'cac.is_active = true and cac.covered_from <= current_date and cac.covered_until >= current_date',
    )
  } else if (stateFilter === 'expired') {
    where.push('cac.covered_until < current_date')
  }

  const whereSql = where.join(' and ')
  const orderBy =
    sortColumns[query.sortBy ?? 'coveredUntil'] ?? 'cac.covered_until'
  const direction = query.sortDirection === 'asc' ? 'asc' : 'desc'
  const selectSql = `
        select
          cac.id,
          cac.society_id,
          cac.flat_id,
          f.flat_number,
          b.name as block_name,
          f.unit_type,
          cac.covered_from::text,
          cac.covered_until::text,
          cac.amount::text,
          cac.source,
          cac.reference,
          cac.notes,
          cac.is_active,
          u.full_name as primary_resident_name,
          cac.created_at::text,
          cac.updated_at::text
        from cam_advance_coverages cac
        inner join flats f on f.id = cac.flat_id
        inner join blocks b on b.id = f.block_id
        left join lateral (
          select u.full_name
          from flat_residents fr
          inner join users u on u.id = fr.user_id
          where fr.flat_id = f.id
            and fr.is_active = true
            and fr.is_billing_contact = true
          limit 1
        ) u on true
        where ${whereSql}
        order by ${orderBy} ${direction}, b.sort_order asc, ${flatNumberSortExpression} asc, f.flat_number asc
      `
  const countPromise = pool.query<{ count: string }>(
    `
        select count(*)::text as count
        from cam_advance_coverages cac
        inner join flats f on f.id = cac.flat_id
        inner join blocks b on b.id = f.block_id
        left join lateral (
          select u.full_name
          from flat_residents fr
          inner join users u on u.id = fr.user_id
          where fr.flat_id = f.id
            and fr.is_active = true
            and fr.is_billing_contact = true
          limit 1
        ) u on true
        where ${whereSql}
      `,
    values,
  )

  if (rawQuery.export === 'xlsx' || rawQuery.export === 'excel') {
    const [dataResult, countResult] = await Promise.all([
      pool.query<CoverageRow>(`${selectSql} limit $${values.length + 1}`, [
        ...values,
        exportLimit,
      ]),
      countPromise,
    ])
    setEventHeader(
      event,
      'content-type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    setEventHeader(
      event,
      'content-disposition',
      `attachment; filename="cam-advance-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    )
    return buildCoverageWorkbook(
      dataResult.rows.map(mapCoverage),
      Number(countResult.rows[0]?.count ?? 0),
      {
        search: query.search,
        state: query.filters.state?.[0],
        source: query.filters.source?.[0],
      },
    )
  }

  const [dataResult, countResult] = await Promise.all([
    pool.query<CoverageRow>(
      `${selectSql} limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    ),
    countPromise,
  ])

  return createPaginatedSuccess(
    event,
    dataResult.rows.map(mapCoverage),
    Number(countResult.rows[0]?.count ?? 0),
    query,
  )
})
