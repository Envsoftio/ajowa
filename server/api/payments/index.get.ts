import { createPaginatedSuccess, getPaginationParams } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const query = getQuery(event)
  const pagination = getPaginationParams(query)
  const offset = (pagination.page - 1) * pagination.pageSize
  const isStaff = ['ADMIN', 'MANAGER'].includes(authMe.user.role)

  const conditions = []
  const params: unknown[] = []

  if (!isStaff) {
    params.push(authMe.user.id)
    conditions.push(`p.payer_user_id = $${params.length}`)
  }

  for (const [key, column] of [
    ['flatId', 'p.received_for_flat_id'],
    ['status', 'p.status'],
    ['mode', 'p.mode'],
  ] as const) {
    if (query[key]) {
      params.push(String(query[key]))
      conditions.push(`${column} = $${params.length}`)
    }
  }

  if (query.reference) {
    params.push(`%${String(query.reference).toLowerCase()}%`)
    conditions.push(
      `(lower(coalesce(p.utr_reference, '')) like $${params.length} or lower(coalesce(p.bank_reference, '')) like $${params.length} or lower(coalesce(p.receipt_number, '')) like $${params.length})`,
    )
  }

  if (query.fromDate) {
    params.push(String(query.fromDate))
    conditions.push(`p.payment_date >= $${params.length}`)
  }

  if (query.toDate) {
    params.push(String(query.toDate))
    conditions.push(`p.payment_date <= $${params.length}`)
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
  const totalResult = await queryRows<{ count: string }>(
    `select count(*)::text as count from payments p ${where}`,
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
        p.transfer_kind as "transferKind",
        p.status,
        p.utr_reference as "utrReference",
        p.bank_reference as "bankReference",
        p.proof_file_path as "proofFilePath",
        p.receipt_number as "receiptNumber",
        p.receipt_file_path as "receiptFilePath",
        p.created_at as "createdAt",
        f.flat_number as "flatNumber",
        b.name as "blockName",
        u.full_name as "payerName"
      from payments p
      left join flats f on f.id = p.received_for_flat_id
      left join blocks b on b.id = f.block_id
      left join users u on u.id = p.payer_user_id
      ${where}
      order by p.payment_date desc, p.created_at desc
      limit $${params.length - 1} offset $${params.length}
    `,
    params,
  )

  return createPaginatedSuccess(event, rows.rows, Number(totalResult.rows[0]?.count ?? 0), pagination)
})
