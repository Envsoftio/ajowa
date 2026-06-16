import { createPaginatedSuccess, getPaginationParams } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const query = getQuery(event)
  const pagination = getPaginationParams(query)
  const offset = (pagination.page - 1) * pagination.pageSize
  const params: unknown[] = [authMe.user.id]
  const conditions = [`p.payer_user_id = $1`, `p.receipt_number is not null`]

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
    params.push(String(query.flatId))
    conditions.push(`p.received_for_flat_id = $${params.length}`)
  }
  if (query.search) {
    params.push(`%${String(query.search).toLowerCase()}%`)
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
        p.receipt_generated_at as "receiptGeneratedAt",
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
