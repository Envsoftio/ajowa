import { createPaginatedSuccess } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getDgAdvanceRegisterStatePredicate } from '~/server/utils/dg-advance'
import { parseListQuery } from '~/server/utils/master-data'
import type { DgAdvanceCredit, DgAdvanceCreditStatus } from '~/types/domain'

type DgAdvanceCreditRow = {
  id: string
  society_id: string
  flat_id: string
  flat_number: string
  block_name: string
  unit_type: string
  user_id: string
  payer_name: string | null
  original_amount: string
  current_balance: string
  status: DgAdvanceCreditStatus
  source_payment_id: string | null
  payment_date: string | null
  payment_mode: string | null
  payment_reference: string | null
  receipt_number: string | null
  payment_notes: string | null
  credit_notes: string | null
  created_at: string
  updated_at: string
}

const flatNumberSortExpression =
  "coalesce(nullif(regexp_replace(f.flat_number, '\\D', '', 'g'), '')::integer, 2147483647)"

const sortColumns: Record<string, string> = {
  flatNumber: flatNumberSortExpression,
  originalAmount: 'rac.original_amount',
  currentBalance: 'rac.current_balance',
  paymentDate: 'p.payment_date',
  status: 'rac.status',
  createdAt: 'rac.created_at',
  updatedAt: 'rac.updated_at',
}

const mapCredit = (row: DgAdvanceCreditRow): DgAdvanceCredit => ({
  id: row.id,
  societyId: row.society_id,
  flatId: row.flat_id,
  flatNumber: row.flat_number,
  blockName: row.block_name,
  unitType: row.unit_type,
  payerUserId: row.user_id,
  payerName: row.payer_name,
  originalAmount: Number(row.original_amount),
  currentBalance: Number(row.current_balance),
  status: row.status,
  sourcePaymentId: row.source_payment_id,
  paymentDate: row.payment_date,
  paymentMode: row.payment_mode,
  reference: row.payment_reference,
  receiptNumber: row.receipt_number,
  paymentNotes: row.payment_notes,
  creditNotes: row.credit_notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'billing.manage')
  const query = parseListQuery(event)
  const pool = getDatabasePool()
  const where = ['rac.society_id = $1', "rac.applicable_charge_type = 'DG_SET'"]
  const values: unknown[] = [authMe.user.societyId]

  if (query.search) {
    values.push(`%${query.search}%`)
    const searchParameter = `$${values.length}`
    where.push(`(
      f.flat_number ilike ${searchParameter}
      or b.name ilike ${searchParameter}
      or u.full_name ilike ${searchParameter}
      or p.receipt_number ilike ${searchParameter}
      or p.utr_reference ilike ${searchParameter}
      or p.bank_reference ilike ${searchParameter}
    )`)
  }

  const state = query.filters.state?.[0]
  const statePredicate = getDgAdvanceRegisterStatePredicate(state)
  if (statePredicate) where.push(statePredicate)

  const whereSql = where.join(' and ')
  const orderBy = sortColumns[query.sortBy ?? 'createdAt'] ?? 'rac.created_at'
  const direction = query.sortDirection === 'asc' ? 'asc' : 'desc'
  const dataValues = [
    ...values,
    query.pageSize,
    (query.page - 1) * query.pageSize,
  ]

  const [dataResult, countResult] = await Promise.all([
    pool.query<DgAdvanceCreditRow>(
      `
        select
          rac.id,
          rac.society_id,
          rac.flat_id,
          f.flat_number,
          b.name as block_name,
          f.unit_type,
          rac.user_id,
          u.full_name as payer_name,
          rac.original_amount::text,
          rac.current_balance::text,
          rac.status::text,
          rac.source_payment_id,
          p.payment_date::text,
          p.mode::text as payment_mode,
          coalesce(p.utr_reference, p.bank_reference) as payment_reference,
          p.receipt_number,
          p.notes as payment_notes,
          rac.notes as credit_notes,
          rac.created_at::text,
          rac.updated_at::text
        from resident_advance_credits rac
        inner join flats f on f.id = rac.flat_id
        inner join blocks b on b.id = f.block_id
        left join users u on u.id = rac.user_id
        left join payments p on p.id = rac.source_payment_id
        where ${whereSql}
        order by ${orderBy} ${direction}, rac.created_at desc, rac.id desc
        limit $${dataValues.length - 1}
        offset $${dataValues.length}
      `,
      dataValues,
    ),
    pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from resident_advance_credits rac
        inner join flats f on f.id = rac.flat_id
        inner join blocks b on b.id = f.block_id
        left join users u on u.id = rac.user_id
        left join payments p on p.id = rac.source_payment_id
        where ${whereSql}
      `,
      values,
    ),
  ])

  return createPaginatedSuccess(
    event,
    dataResult.rows.map(mapCredit),
    Number(countResult.rows[0]?.count ?? 0),
    query,
  )
})
