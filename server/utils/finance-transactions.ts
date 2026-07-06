import type { Pool } from 'pg'
import type { FinanceTransaction } from '~/types/domain'

export type FinanceTransactionRow = {
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
  expense_payment_count: string
  expense_payment_total: string
  latest_expense_payment_date: string | null
  attachment_count: string
  attachment_required: boolean
  created_by_name: string | null
  approved_by_name: string | null
  approved_at: string | null
  posted_at: string | null
  reversed_at: string | null
  created_at: string
  updated_at: string
}

export type FinanceTransactionSummary = {
  total: number
  income: number
  expense: number
  missingAttachments: number
}

export type FinanceTransactionFilterSql = {
  filters: string[]
  params: unknown[]
}

export const financeTransactionExportLimit = 10000

const sortColumns: Record<string, string> = {
  transactionDate: 't.transaction_date',
  title: 't.title',
  transactionType: 't.transaction_type',
  categoryName: 'tc.name',
  amount: 't.amount',
  status: 't.status',
  createdAt: 't.created_at',
}

const queryText = (value: unknown) => {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first : ''
}

const queryNumber = (value: unknown) => {
  if (value === undefined) return null

  const number = Number(queryText(value))
  return Number.isFinite(number) ? number : null
}

export const getFinanceTransactionSort = (
  query: Record<string, unknown>,
): { orderBy: string; sortDirection: 'asc' | 'desc' } => {
  const sortBy = queryText(query.sortBy) || 'transactionDate'
  const sortDirection: 'asc' | 'desc' = queryText(query.sortDirection) === 'asc' ? 'asc' : 'desc'

  return {
    orderBy: sortColumns[sortBy] ?? sortColumns.transactionDate!,
    sortDirection,
  }
}

export const buildFinanceTransactionFilterSql = (
  societyId: string,
  query: Record<string, unknown>,
): FinanceTransactionFilterSql => {
  const search = queryText(query.search).trim().toLowerCase()
  const transactionType = queryText(query.transactionType)
  const status = queryText(query.status)
  const categoryId = queryText(query.categoryId)
  const bankAccountId = queryText(query.bankAccountId)
  const billingPeriodId = queryText(query.billingPeriodId)
  const dateFrom = queryText(query.dateFrom)
  const dateTo = queryText(query.dateTo)
  const counterparty = queryText(query.counterparty).trim().toLowerCase()
  const voucherNumber = queryText(query.voucherNumber).trim().toLowerCase()
  const attachment = queryText(query.attachment)
  const mode = queryText(query.mode).trim().toLowerCase()
  const minAmount = queryNumber(query.minAmount)
  const maxAmount = queryNumber(query.maxAmount)
  const highValueOnly = queryText(query.highValueOnly) === 'true'
  const highValueThreshold = queryNumber(query.highValueThreshold) ?? 0

  const params: unknown[] = [societyId]
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
  if (categoryId) {
    params.push(categoryId)
    filters.push(`t.category_id = $${params.length}`)
  }
  if (bankAccountId) {
    params.push(bankAccountId)
    filters.push(`t.bank_account_id = $${params.length}`)
  }
  if (billingPeriodId) {
    params.push(billingPeriodId)
    filters.push(`t.billing_period_id = $${params.length}`)
  }
  if (dateFrom) {
    params.push(dateFrom)
    filters.push(`t.transaction_date >= $${params.length}`)
  }
  if (dateTo) {
    params.push(dateTo)
    filters.push(`t.transaction_date <= $${params.length}`)
  }
  if (counterparty) {
    params.push(`%${counterparty}%`)
    filters.push(`lower(coalesce(t.counterparty_name, '')) like $${params.length}`)
  }
  if (voucherNumber) {
    params.push(`%${voucherNumber}%`)
    filters.push(`lower(coalesce(t.voucher_number, '')) like $${params.length}`)
  }
  if (mode) {
    params.push(`%mode: ${mode}%`)
    filters.push(`lower(coalesce(t.description, '')) like $${params.length}`)
  }
  if (minAmount !== null) {
    params.push(minAmount)
    filters.push(`t.amount >= $${params.length}`)
  }
  if (maxAmount !== null) {
    params.push(maxAmount)
    filters.push(`t.amount <= $${params.length}`)
  }
  if (highValueOnly && highValueThreshold > 0) {
    params.push(highValueThreshold)
    filters.push(`t.amount >= $${params.length}`)
  }
  if (attachment === 'present') {
    filters.push('coalesce(ta_counts.attachment_count, 0) > 0')
  } else if (attachment === 'missing') {
    filters.push('coalesce(ta_counts.attachment_count, 0) = 0')
  }

  return { filters, params }
}

export const financeTransactionFromRow = (row: FinanceTransactionRow): FinanceTransaction => ({
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
  expensePaymentCount: Number(row.expense_payment_count ?? 0),
  expensePaymentTotal: Number(row.expense_payment_total ?? 0),
  latestExpensePaymentDate: row.latest_expense_payment_date,
  attachmentCount: Number(row.attachment_count ?? 0),
  hasAttachments: Number(row.attachment_count ?? 0) > 0,
  attachmentRequired: row.attachment_required,
  createdByName: row.created_by_name,
  approvedByName: row.approved_by_name,
  approvedAt: row.approved_at,
  postedAt: row.posted_at,
  reversedAt: row.reversed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const getFinanceTransactionSummary = async (
  pool: Pool,
  filterSql: FinanceTransactionFilterSql,
): Promise<FinanceTransactionSummary> => {
  const summary = await pool.query<{
    count: string
    incomeTotal: string
    expenseTotal: string
    missingAttachments: string
  }>(
    `
      select
        count(*)::text as count,
        coalesce(sum(case when t.transaction_type = 'INCOME' then t.amount else 0 end), 0)::text as "incomeTotal",
        coalesce(sum(case when t.transaction_type = 'EXPENSE' then t.amount else 0 end), 0)::text as "expenseTotal",
        coalesce(
          sum(
            case
              when coalesce(ta_counts.attachment_count, 0) = 0 then 1
              else 0
            end
          ),
          0
        )::text as "missingAttachments"
      from transactions t
      join transaction_categories tc on tc.id = t.category_id
      left join (
        select transaction_id, count(*)::int as attachment_count
        from transaction_attachments
        where replaced_at is null
        group by transaction_id
      ) ta_counts on ta_counts.transaction_id = t.id
      where ${filterSql.filters.join(' and ')}
    `,
    filterSql.params,
  )

  return {
    total: Number(summary.rows[0]?.count ?? 0),
    income: Number(summary.rows[0]?.incomeTotal ?? 0),
    expense: Number(summary.rows[0]?.expenseTotal ?? 0),
    missingAttachments: Number(summary.rows[0]?.missingAttachments ?? 0),
  }
}

export const getFinanceTransactionRows = async (
  pool: Pool,
  filterSql: FinanceTransactionFilterSql,
  options: {
    limit: number
    offset?: number
    orderBy: string
    sortDirection: 'asc' | 'desc'
  },
) => {
  const params = [...filterSql.params, options.limit]
  const limitPlaceholder = `$${params.length}`
  let offsetSql = ''

  if (options.offset !== undefined) {
    params.push(options.offset)
    offsetSql = ` offset $${params.length}`
  }

  return await pool.query<FinanceTransactionRow>(
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
        coalesce(ep_counts.payment_count, 0)::text as expense_payment_count,
        coalesce(ep_counts.payment_total, 0)::text as expense_payment_total,
        ep_counts.latest_payment_date::text as latest_expense_payment_date,
        coalesce(ta_counts.attachment_count, 0)::text as attachment_count,
        tc.requires_attachment as attachment_required,
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
      left join (
        select
          transaction_id,
          count(*)::int as payment_count,
          coalesce(sum(amount), 0) as payment_total,
          max(payment_date) as latest_payment_date
        from expense_payments
        group by transaction_id
      ) ep_counts on ep_counts.transaction_id = t.id
      left join (
        select transaction_id, count(*)::int as attachment_count
        from transaction_attachments
        where replaced_at is null
        group by transaction_id
      ) ta_counts on ta_counts.transaction_id = t.id
      left join users creator on creator.id = t.created_by_user_id
      left join users approver on approver.id = t.approved_by_user_id
      where ${filterSql.filters.join(' and ')}
      order by ${options.orderBy} ${options.sortDirection}, t.created_at desc
      limit ${limitPlaceholder}${offsetSql}
    `,
    params,
  )
}
