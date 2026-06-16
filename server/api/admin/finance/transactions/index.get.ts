import { createApiSuccess, getPaginationParams } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getQuerySafe } from '~/server/utils/master-data'
import type { FinanceTransaction } from '~/types/domain'

type TransactionRow = {
  id: string
  society_id: string
  transaction_type: FinanceTransaction['transactionType']
  category_id: string
  category_name: string
  category_group: string
  bank_account_id: string | null
  bank_account_name: string | null
  billing_period_id: string | null
  billing_period_label: string | null
  title: string
  description: string | null
  counterparty_name: string | null
  voucher_number: string | null
  transaction_date: string
  amount: string
  status: FinanceTransaction['status']
  journal_voucher_number: string | null
  created_by_name: string | null
  approved_by_name: string | null
  approved_at: string | null
  posted_at: string | null
  reversed_at: string | null
  created_at: string
  updated_at: string
}

const mapTransaction = (row: TransactionRow): FinanceTransaction => ({
  id: row.id,
  societyId: row.society_id,
  transactionType: row.transaction_type,
  categoryId: row.category_id,
  categoryName: row.category_name,
  categoryGroup: row.category_group,
  bankAccountId: row.bank_account_id,
  bankAccountName: row.bank_account_name,
  billingPeriodId: row.billing_period_id,
  billingPeriodLabel: row.billing_period_label,
  title: row.title,
  description: row.description,
  counterpartyName: row.counterparty_name,
  voucherNumber: row.voucher_number,
  transactionDate: row.transaction_date,
  amount: Number(row.amount),
  status: row.status,
  journalVoucherNumber: row.journal_voucher_number,
  createdByName: row.created_by_name,
  approvedByName: row.approved_by_name,
  approvedAt: row.approved_at,
  postedAt: row.posted_at,
  reversedAt: row.reversed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = getQuerySafe(event)
  const pagination = getPaginationParams(query)
  const offset = (pagination.page - 1) * pagination.pageSize
  const search = String(query.search ?? '').trim().toLowerCase()
  const transactionType = String(query.transactionType ?? '')
  const status = String(query.status ?? '')

  const params: unknown[] = [authMe.user.societyId]
  const filters = ['t.society_id = $1']
  if (search) {
    params.push(`%${search}%`)
    filters.push(`(lower(t.title) like $${params.length} or lower(coalesce(t.counterparty_name, '')) like $${params.length} or lower(coalesce(t.voucher_number, '')) like $${params.length} or lower(tc.name) like $${params.length})`)
  }
  if (transactionType) {
    params.push(transactionType)
    filters.push(`t.transaction_type::text = $${params.length}`)
  }
  if (status) {
    params.push(status)
    filters.push(`t.status::text = $${params.length}`)
  }

  const pool = getDatabasePool()
  const total = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from transactions t
      join transaction_categories tc on tc.id = t.category_id
      where ${filters.join(' and ')}
    `,
    params,
  )
  params.push(pagination.pageSize, offset)
  const result = await pool.query<TransactionRow>(
    `
      select
        t.id,
        t.society_id,
        t.transaction_type::text,
        t.category_id,
        tc.name as category_name,
        tc.category_group,
        t.bank_account_id,
        ba.account_name as bank_account_name,
        t.billing_period_id,
        bp.label as billing_period_label,
        t.title,
        t.description,
        t.counterparty_name,
        t.voucher_number,
        t.transaction_date::text,
        t.amount::text,
        t.status::text,
        je.voucher_number as journal_voucher_number,
        creator.full_name as created_by_name,
        approver.full_name as approved_by_name,
        t.approved_at::text,
        t.posted_at::text,
        t.reversed_at::text,
        t.created_at::text,
        t.updated_at::text
      from transactions t
      join transaction_categories tc on tc.id = t.category_id
      left join society_bank_accounts ba on ba.id = t.bank_account_id
      left join billing_periods bp on bp.id = t.billing_period_id
      left join journal_entries je on je.transaction_id = t.id and je.status = 'POSTED'
      left join users creator on creator.id = t.created_by_user_id
      left join users approver on approver.id = t.approved_by_user_id
      where ${filters.join(' and ')}
      order by t.transaction_date desc, t.created_at desc
      limit $${params.length - 1} offset $${params.length}
    `,
    params,
  )

  return createApiSuccess(event, {
    items: result.rows.map(mapTransaction),
    total: Number(total.rows[0]?.count ?? 0),
    page: pagination.page,
    pageSize: pagination.pageSize,
  })
})
