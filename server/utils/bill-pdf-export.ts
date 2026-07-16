import { z } from 'zod'
import { todayDate } from './billing'
import { camAdvanceCoverageLateralSql } from './cam-advance'
import { getDatabasePool } from './database'
import { AppError } from './errors'

export const maxBillPdfExportDueIds = 1000

export const billingChargeTypeSchema = z.enum(['GENERAL', 'CAM', 'DG_SET'])

export const billPdfExportFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  billingPeriodId: z.string().uuid().optional(),
  chargeType: billingChargeTypeSchema.optional(),
  chargeTypes: z.array(billingChargeTypeSchema).max(3).optional(),
  status: z.enum(['OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'WAIVED', 'CANCELLED']).optional(),
  balance: z.enum(['outstanding', 'paid']).optional(),
  overdue: z.union([z.boolean(), z.literal('true'), z.literal('false')]).optional(),
  advance: z.enum(['covered', 'billable']).optional(),
  sortBy: z.enum(['flatNumber', 'blockName', 'dueDate', 'totalAmount', 'balanceAmount', 'status']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
})

export const billPdfExportRequestSchema = z.object({
  dueIds: z.array(z.string().uuid()).max(maxBillPdfExportDueIds).optional(),
  filters: billPdfExportFiltersSchema.optional(),
})

type BillPdfExportDueRow = {
  id: string
}

type BillPdfExportSelectionOptions = {
  limit?: number | undefined
  offset?: number | undefined
  maxTotal?: number | undefined
  overMaxMessage?: ((total: number, maxTotal: number) => string) | undefined
}

export type BillPdfExportFilters = z.output<typeof billPdfExportFiltersSchema>
export type BillPdfExportRequest = z.output<typeof billPdfExportRequestSchema>

export type BillPdfExportSelection = {
  ids: string[]
  total: number
  offset: number
  limit: number
}

export const flatNumberSortExpression =
  "coalesce(nullif(regexp_replace(f.flat_number, '\\D', '', 'g'), '')::integer, 2147483647)"

const sortColumns: Record<string, string> = {
  flatNumber: flatNumberSortExpression,
  blockName: 'b.sort_order',
  dueDate: 'md.due_date',
  totalAmount: 'md.total_amount::numeric',
  balanceAmount: 'md.balance_amount::numeric',
  status: 'md.status',
}

export const sanitizeBillPdfFileName = (value: string) =>
  value.replace(/"/g, '').replace(/[/\\?%*:|<>]/g, '-')

export const uniqueBillPdfZipEntryName = (fileName: string, usedNames: Map<string, number>) => {
  const safeName = sanitizeBillPdfFileName(fileName)
  const previousCount = usedNames.get(safeName) ?? 0
  usedNames.set(safeName, previousCount + 1)

  if (previousCount === 0) {
    return safeName
  }

  return safeName.replace(/\.pdf$/i, `-${previousCount + 1}.pdf`)
}

const getSelectedDueIds = async (societyId: string, dueIds: string[]) => {
  const result = await getDatabasePool().query<BillPdfExportDueRow>(
    `
      select md.id::text
      from maintenance_dues md
      inner join flats f on f.id = md.flat_id
      inner join blocks b on b.id = f.block_id
      where md.society_id = $1
        and md.id = any($2::uuid[])
      order by array_position($2::uuid[], md.id), b.sort_order asc, ${flatNumberSortExpression} asc, f.flat_number asc
    `,
    [societyId, dueIds],
  )

  return result.rows.map((row) => row.id)
}

const buildFilteredDueQuery = (
  societyId: string,
  filters: BillPdfExportFilters = {},
) => {
  const where: string[] = ['md.society_id = $1']
  const values: unknown[] = [societyId]
  const today = todayDate()

  if (filters.search) {
    values.push(`%${filters.search}%`)
    where.push(`(f.flat_number ilike $${values.length} or b.name ilike $${values.length} or billing_contact.full_name ilike $${values.length})`)
  }

  if (filters.billingPeriodId) {
    values.push(filters.billingPeriodId)
    where.push(`md.billing_period_id = $${values.length}`)
  }

  const chargeTypes = Array.from(new Set([
    ...(filters.chargeType ? [filters.chargeType] : []),
    ...(filters.chargeTypes ?? []),
  ]))

  if (chargeTypes.length > 0) {
    values.push(chargeTypes)
    where.push(`bp.charge_type::text = any($${values.length}::text[])`)
  }

  if (filters.status) {
    values.push(filters.status)
    where.push(`case when coverage.id is not null and md.balance_amount::numeric = 0 then 'PAID' else md.status::text end = $${values.length}`)
  }

  if (filters.balance === 'outstanding') {
    where.push('md.balance_amount::numeric > 0')
  } else if (filters.balance === 'paid') {
    where.push('md.balance_amount::numeric = 0')
  }

  if (filters.overdue === true || filters.overdue === 'true') {
    values.push(today)
    where.push(`
      md.balance_amount::numeric > 0
      and coalesce(
        md.late_fee_starts_on,
        (
          md.due_date
          + (
            (
              coalesce(nullif(sp.settings->>'graceDays', '')::integer, 0)
              + 1
            ) * interval '1 day'
          )
        )::date
      ) <= $${values.length}::date
    `)
  }

  if (filters.advance === 'covered') {
    where.push('coverage.id is not null and md.balance_amount::numeric = 0')
  } else if (filters.advance === 'billable') {
    where.push('(coverage.id is null or md.balance_amount::numeric > 0)')
  }

  const orderBy = sortColumns[filters.sortBy ?? 'flatNumber'] ?? flatNumberSortExpression
  const direction = filters.sortDirection === 'desc' ? 'desc' : 'asc'
  const orderSql = filters.sortBy === 'flatNumber' || !filters.sortBy
    ? `b.sort_order ${direction}, ${flatNumberSortExpression} ${direction}, f.flat_number ${direction}`
    : `${orderBy} ${direction}, b.sort_order asc, ${flatNumberSortExpression} asc, f.flat_number asc`

  const fromSql = `
      select md.id::text
      from maintenance_dues md
      inner join society_profile sp on sp.id = md.society_id
      inner join billing_periods bp on bp.id = md.billing_period_id
      inner join flats f on f.id = md.flat_id
      inner join blocks b on b.id = f.block_id
      left join lateral (
        ${camAdvanceCoverageLateralSql('f', 'bp')}
      ) coverage on bp.charge_type = 'CAM'
      left join lateral (
        select u.full_name
        from flat_residents fr
        inner join users u on u.id = fr.user_id
        where fr.flat_id = md.flat_id
          and fr.is_active = true
          and fr.is_billing_contact = true
        limit 1
      ) billing_contact on true
      where ${where.join(' and ')}
  `

  return { fromSql, orderSql, values }
}

const assertSelectionTotal = (
  total: number,
  options: BillPdfExportSelectionOptions,
) => {
  if (!options.maxTotal || total <= options.maxTotal) {
    return
  }

  throw new AppError({
    code: 'VALIDATION_ERROR',
    statusCode: 413,
    message: options.overMaxMessage?.(total, options.maxTotal) ??
      `This export matches ${total} bill PDFs. Please narrow the selection to ${options.maxTotal} or fewer bills.`,
  })
}

const getSelectedDueSelection = async (
  societyId: string,
  dueIds: string[],
  options: BillPdfExportSelectionOptions,
): Promise<BillPdfExportSelection> => {
  const allIds = await getSelectedDueIds(societyId, dueIds)

  assertSelectionTotal(allIds.length, options)

  const offset = options.offset ?? 0
  const selectedIds = options.limit
    ? allIds.slice(offset, offset + options.limit)
    : allIds.slice(offset)

  return {
    ids: selectedIds,
    total: allIds.length,
    offset,
    limit: options.limit ?? selectedIds.length,
  }
}

const getFilteredDueSelection = async (
  societyId: string,
  filters: BillPdfExportFilters = {},
  options: BillPdfExportSelectionOptions,
): Promise<BillPdfExportSelection> => {
  const { fromSql, orderSql, values } = buildFilteredDueQuery(societyId, filters)
  const pool = getDatabasePool()
  const countSql = `select count(*)::text as count from (${fromSql}) downloadable_dues`
  const countResult = await pool.query<{ count: string }>(countSql, values)
  const total = Number(countResult.rows[0]?.count ?? 0)

  assertSelectionTotal(total, options)

  const queryValues = [...values]
  const pagingSql: string[] = []
  const offset = options.offset ?? 0

  if (options.limit) {
    queryValues.push(options.limit)
    pagingSql.push(`limit $${queryValues.length}`)
  }

  if (offset > 0 || options.limit) {
    queryValues.push(offset)
    pagingSql.push(`offset $${queryValues.length}`)
  }

  const result = await pool.query<BillPdfExportDueRow>(
    `
      ${fromSql}
      order by ${orderSql}
      ${pagingSql.join('\n')}
    `,
    queryValues,
  )

  return {
    ids: result.rows.map((row) => row.id),
    total,
    offset,
    limit: options.limit ?? result.rows.length,
  }
}

export const getBillPdfExportSelection = async (
  societyId: string,
  request: BillPdfExportRequest,
  options: BillPdfExportSelectionOptions = {},
) => {
  if (request.dueIds?.length) {
    return getSelectedDueSelection(societyId, request.dueIds, options)
  }

  return getFilteredDueSelection(societyId, request.filters, options)
}

export const resolveBillPdfExportDueIds = async (
  societyId: string,
  request: BillPdfExportRequest,
  maxTotal = maxBillPdfExportDueIds,
) => {
  const selection = await getBillPdfExportSelection(societyId, request, {
    maxTotal,
  })

  return selection.ids
}
