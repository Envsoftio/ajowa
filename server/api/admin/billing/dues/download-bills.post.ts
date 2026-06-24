import { z } from 'zod'
import { readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { camAdvanceCoverageLateralSql } from '~/server/utils/cam-advance'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { generateMaintenanceBillPdf, todayDate } from '~/server/utils/billing'
import { createZipBuffer } from '~/server/utils/zip'

const billingChargeTypeSchema = z.enum(['GENERAL', 'CAM', 'DG_SET'])

const downloadFiltersSchema = z.object({
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

const downloadBillsSchema = z.object({
  dueIds: z.array(z.string().uuid()).max(1000).optional(),
  filters: downloadFiltersSchema.optional(),
})

type DownloadDueRow = {
  id: string
}

const flatNumberSortExpression =
  "coalesce(nullif(regexp_replace(f.flat_number, '\\D', '', 'g'), '')::integer, 2147483647)"

const sortColumns: Record<string, string> = {
  flatNumber: flatNumberSortExpression,
  blockName: 'b.sort_order',
  dueDate: 'md.due_date',
  totalAmount: 'md.total_amount::numeric',
  balanceAmount: 'md.balance_amount::numeric',
  status: 'md.status',
}

const sanitizeDownloadFileName = (value: string) =>
  value.replace(/"/g, '').replace(/[/\\?%*:|<>]/g, '-')

const uniqueZipEntryName = (fileName: string, usedNames: Map<string, number>) => {
  const safeName = sanitizeDownloadFileName(fileName)
  const previousCount = usedNames.get(safeName) ?? 0
  usedNames.set(safeName, previousCount + 1)

  if (previousCount === 0) {
    return safeName
  }

  return safeName.replace(/\.pdf$/i, `-${previousCount + 1}.pdf`)
}

const getSelectedDueIds = async (societyId: string, dueIds: string[]) => {
  const result = await getDatabasePool().query<DownloadDueRow>(
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

const getFilteredDueIds = async (
  societyId: string,
  filters: z.output<typeof downloadFiltersSchema> = {},
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
    where.push(`case when coverage.id is not null then 'PAID' else md.status::text end = $${values.length}`)
  }

  if (filters.balance === 'outstanding') {
    where.push('coverage.id is null and md.balance_amount::numeric > 0')
  } else if (filters.balance === 'paid') {
    where.push('(coverage.id is not null or md.balance_amount::numeric = 0)')
  }

  if (filters.overdue === true || filters.overdue === 'true') {
    values.push(today)
    where.push(`coverage.id is null and md.balance_amount::numeric > 0 and md.due_date < $${values.length}::date`)
  }

  if (filters.advance === 'covered') {
    where.push('coverage.id is not null')
  } else if (filters.advance === 'billable') {
    where.push('coverage.id is null')
  }

  const orderBy = sortColumns[filters.sortBy ?? 'flatNumber'] ?? flatNumberSortExpression
  const direction = filters.sortDirection === 'desc' ? 'desc' : 'asc'
  const orderSql = filters.sortBy === 'flatNumber' || !filters.sortBy
    ? `b.sort_order ${direction}, ${flatNumberSortExpression} ${direction}, f.flat_number ${direction}`
    : `${orderBy} ${direction}, b.sort_order asc, ${flatNumberSortExpression} asc, f.flat_number asc`

  const result = await getDatabasePool().query<DownloadDueRow>(
    `
      select md.id::text
      from maintenance_dues md
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
      order by ${orderSql}
    `,
    values,
  )

  return result.rows.map((row) => row.id)
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validateInput(downloadBillsSchema, await readJsonBody(event))
  const dueIds = body.dueIds?.length
    ? await getSelectedDueIds(authMe.user.societyId, body.dueIds)
    : await getFilteredDueIds(authMe.user.societyId, body.filters)

  if (dueIds.length === 0) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'No bill PDFs matched this download request.',
    })
  }

  const usedNames = new Map<string, number>()
  const zipEntries = []

  for (const dueId of dueIds) {
    const bill = await generateMaintenanceBillPdf(dueId, {
      societyId: authMe.user.societyId,
      isStaff: true,
    })

    zipEntries.push({
      name: uniqueZipEntryName(bill.fileName, usedNames),
      data: bill.buffer,
    })
  }

  const zipBuffer = createZipBuffer(zipEntries)
  const fileName = `maintenance-bills-${new Date().toISOString().slice(0, 10)}.zip`

  return new Response(new Uint8Array(zipBuffer), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${fileName}"`,
      'x-bill-count': String(zipEntries.length),
    },
  })
})
