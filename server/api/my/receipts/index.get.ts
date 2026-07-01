import { z } from 'zod'
import { createPaginatedSuccess, getPaginationParams, validateInput } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'
import { getQuerySafe } from '~/server/utils/master-data'

const optionalDateSchema = z.preprocess(
  (value) => (value === '' || value == null ? undefined : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`)

      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    })
    .optional(),
)

const optionalAmountSchema = z.preprocess(
  (value) => (value === '' || value == null ? undefined : value),
  z.coerce.number().nonnegative().optional(),
)

const receiptsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  search: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined),
    z.string().max(120).optional(),
  ),
  fromDate: optionalDateSchema,
  toDate: optionalDateSchema,
  minAmount: optionalAmountSchema,
  maxAmount: optionalAmountSchema,
  mode: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined),
    z.string().max(40).optional(),
  ),
  flatId: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined),
    z.string().uuid().optional(),
  ),
  billingPeriodId: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined),
    z.string().uuid().optional(),
  ),
  periodId: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined),
    z.string().uuid().optional(),
  ),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const query = validateInput(receiptsQuerySchema, getQuerySafe(event))
  const pagination = getPaginationParams(query)
  const offset = (pagination.page - 1) * pagination.pageSize
  const params: unknown[] = [authMe.user.id, authMe.user.societyId]
  const conditions = [
    `p.society_id = $2`,
    `p.receipt_number is not null`,
    `(
      p.payer_user_id = $1
      or exists (
        select 1
        from flat_residents fr
        where fr.user_id = $1
          and fr.flat_id = p.received_for_flat_id
          and fr.is_active = true
      )
    )`,
  ]

  if (query.fromDate) {
    params.push(String(query.fromDate))
    conditions.push(`p.payment_date >= $${params.length}`)
  }
  if (query.toDate) {
    params.push(String(query.toDate))
    conditions.push(`p.payment_date <= $${params.length}`)
  }
  if (query.minAmount) {
    params.push(String(query.minAmount))
    conditions.push(`p.amount >= $${params.length}`)
  }
  if (query.maxAmount) {
    params.push(String(query.maxAmount))
    conditions.push(`p.amount <= $${params.length}`)
  }
  if (query.mode) {
    params.push(String(query.mode))
    conditions.push(`p.mode = $${params.length}`)
  }
  if (query.flatId) {
    params.push(query.flatId)
    conditions.push(`p.received_for_flat_id = $${params.length}`)
  }
  const billingPeriodId = query.billingPeriodId ?? query.periodId
  if (billingPeriodId) {
    params.push(billingPeriodId)
    conditions.push(`
      exists (
        select 1
        from payment_allocations pa_filter
        join maintenance_dues md_filter on md_filter.id = pa_filter.maintenance_due_id
        where pa_filter.payment_id = p.id
          and md_filter.billing_period_id = $${params.length}
      )
    `)
  }
  if (query.search) {
    params.push(`%${query.search.toLowerCase()}%`)
    conditions.push(
      `(lower(coalesce(p.receipt_number, '')) like $${params.length} or lower(coalesce(p.utr_reference, '')) like $${params.length} or lower(coalesce(p.bank_reference, '')) like $${params.length} or lower(coalesce(f.flat_number, '')) like $${params.length} or lower(coalesce(b.name, '')) like $${params.length})`,
    )
  }

  const where = `where ${conditions.join(' and ')}`
  const total = await queryRows<{ count: string }>(
    `
      select count(*)::text as count
      from payments p
      left join flats f on f.id = p.received_for_flat_id
      left join blocks b on b.id = f.block_id
      ${where}
    `,
    params,
  )
  params.push(pagination.pageSize, offset)
  const rows = await queryRows(
    `
      select
        p.id,
        p.payment_date::text as "paymentDate",
        p.amount::text,
        p.mode,
        p.status,
        p.utr_reference as "utrReference",
        p.bank_reference as "bankReference",
        p.receipt_number as "receiptNumber",
        p.receipt_file_path as "receiptFilePath",
        p.receipt_generated_at::text as "receiptGeneratedAt",
        concat('/api/payments/', p.id, '/receipt') as "downloadUrl",
        p.received_for_flat_id as "flatId",
        f.flat_number as "flatNumber",
        b.name as "blockName"
      from payments p
      left join flats f on f.id = p.received_for_flat_id
      left join blocks b on b.id = f.block_id
      ${where}
      order by p.payment_date desc, p.created_at desc
      limit $${params.length - 1} offset $${params.length}
    `,
    params,
  )

  return createPaginatedSuccess(event, rows.rows, Number(total.rows[0]?.count ?? 0), pagination)
})
