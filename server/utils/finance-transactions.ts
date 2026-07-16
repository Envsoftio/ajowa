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

type IncomeReportDrilldownCamRow = {
  payment_id: string
  society_id: string
  category_id: string
  category_name: string
  category_group: string
  billing_period_id: string | null
  billing_period_label: string | null
  title: string
  description: string | null
  counterparty_name: string | null
  voucher_number: string | null
  transaction_date: string
  amount: string
  status: FinanceTransaction['status']
  created_at: string
  updated_at: string
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
  detailPath: `/admin/finance/transactions/${row.id}`,
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

const incomeReportDrilldownTransactionFromCamRow = (
  row: IncomeReportDrilldownCamRow,
): FinanceTransaction => ({
  id: `report-cam-${row.payment_id}`,
  societyId: row.society_id,
  detailPath: null,
  transactionType: 'INCOME',
  categoryId: row.category_id,
  categoryName: row.category_name,
  categoryGroup: row.category_group,
  bankAccountId: null,
  bankAccountName: null,
  billingPeriodId: row.billing_period_id,
  billingPeriodLabel: row.billing_period_label,
  title: row.title,
  description: row.description,
  counterpartyName: row.counterparty_name,
  voucherNumber: row.voucher_number,
  transactionDate: row.transaction_date,
  amount: Number(row.amount),
  status: row.status,
  journalVoucherNumber: null,
  expensePaymentCount: 0,
  expensePaymentTotal: 0,
  latestExpensePaymentDate: null,
  attachmentCount: 0,
  hasAttachments: false,
  attachmentRequired: false,
  createdByName: null,
  approvedByName: null,
  approvedAt: null,
  postedAt: row.transaction_date,
  reversedAt: null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const compareValues = (left: string | number | null | undefined, right: string | number | null | undefined) => {
  if (left == null && right == null) return 0
  if (left == null) return -1
  if (right == null) return 1
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right), undefined, { sensitivity: 'base' })
}

const sortFinanceTransactions = (
  items: FinanceTransaction[],
  orderBy: string,
  sortDirection: 'asc' | 'desc',
) => {
  const direction = sortDirection === 'asc' ? 1 : -1

  return [...items].sort((left, right) => {
    let result: number

    switch (orderBy) {
      case 't.title':
        result = compareValues(left.title, right.title)
        break
      case 't.transaction_type':
        result = compareValues(left.transactionType, right.transactionType)
        break
      case 'tc.name':
        result = compareValues(left.categoryName, right.categoryName)
        break
      case 't.amount':
        result = compareValues(left.amount, right.amount)
        break
      case 't.status':
        result = compareValues(left.status, right.status)
        break
      case 't.created_at':
        result = compareValues(left.createdAt, right.createdAt)
        break
      case 't.transaction_date':
      default:
        result = compareValues(left.transactionDate, right.transactionDate)
        if (result === 0) {
          result = compareValues(left.createdAt, right.createdAt)
        }
        break
    }

    if (result === 0) {
      result = compareValues(left.createdAt, right.createdAt)
    }

    return result * direction
  })
}

export const getFinanceTransactionSummary = async (
  pool: Pool,
  filterSql: FinanceTransactionFilterSql,
  query: Record<string, unknown>,
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

  const camCollectionIncome = await getCamCollectionIncomeSummary(pool, queryText(filterSql.params[0]), query)

  return {
    total: Number(summary.rows[0]?.count ?? 0),
    income: Number(summary.rows[0]?.incomeTotal ?? 0) + camCollectionIncome,
    expense: Number(summary.rows[0]?.expenseTotal ?? 0),
    missingAttachments: Number(summary.rows[0]?.missingAttachments ?? 0),
  }
}

const getCamCollectionIncomeSummary = async (
  pool: Pool,
  societyId: string,
  query: Record<string, unknown>,
) => {
  const transactionType = queryText(query.transactionType)
  const status = queryText(query.status)
  const attachment = queryText(query.attachment)

  if (
    transactionType === 'EXPENSE' ||
    (status && status !== 'POSTED') ||
    attachment === 'present'
  ) {
    return 0
  }

  const search = queryText(query.search).trim().toLowerCase()
  const categoryId = queryText(query.categoryId)
  const bankAccountId = queryText(query.bankAccountId)
  const billingPeriodId = queryText(query.billingPeriodId)
  const dateFrom = queryText(query.dateFrom)
  const dateTo = queryText(query.dateTo)
  const counterparty = queryText(query.counterparty).trim().toLowerCase()
  const voucherNumber = queryText(query.voucherNumber).trim().toLowerCase()
  const mode = queryText(query.mode).trim().toUpperCase()
  const minAmount = queryNumber(query.minAmount)
  const maxAmount = queryNumber(query.maxAmount)
  const highValueOnly = queryText(query.highValueOnly) === 'true'
  const highValueThreshold = queryNumber(query.highValueThreshold) ?? 0

  const params: unknown[] = [societyId]
  const where = [
    'p.society_id = $1',
    "p.status = 'VERIFIED'",
    "bp.charge_type = 'CAM'",
    `not exists (
      select 1
      from transactions source_t
      join transaction_categories source_tc on source_tc.id = source_t.category_id
      where source_t.source_payment_id = p.id
        and source_t.society_id = p.society_id
        and source_t.transaction_type = 'INCOME'
        and source_t.status = 'POSTED'
        and source_tc.code = 'INC-MNT-001'
    )`,
  ]

  if (categoryId) {
    params.push(categoryId)
    where.push(`cc.id = $${params.length}`)
  }
  if (bankAccountId) {
    params.push(bankAccountId)
    where.push(`exists (
      select 1
      from journal_entries je
      join journal_lines jl on jl.journal_entry_id = je.id and jl.line_type = 'DEBIT'
      join society_bank_accounts ba on ba.account_head_id = jl.account_head_id
      where je.payment_id = p.id
        and je.status = 'POSTED'
        and ba.society_id = p.society_id
        and ba.id = $${params.length}
    )`)
  }
  if (billingPeriodId) {
    params.push(billingPeriodId)
    where.push(`bp.id = $${params.length}`)
  }
  if (dateFrom) {
    params.push(dateFrom)
    where.push(`p.payment_date >= $${params.length}`)
  }
  if (dateTo) {
    params.push(dateTo)
    where.push(`p.payment_date <= $${params.length}`)
  }
  if (search) {
    params.push(`%${search}%`)
    where.push(`(
      lower(cc.name) like $${params.length}
      or lower(coalesce(u.full_name, '')) like $${params.length}
      or lower(coalesce(f.flat_number, '')) like $${params.length}
      or lower(coalesce(b.name, '')) like $${params.length}
      or lower(coalesce(p.receipt_number, '')) like $${params.length}
      or lower(coalesce(p.utr_reference, '')) like $${params.length}
      or lower(coalesce(p.bank_reference, '')) like $${params.length}
      or lower(coalesce(bp.label, '')) like $${params.length}
      or lower(coalesce(p.notes, '')) like $${params.length}
    )`)
  }
  if (counterparty) {
    params.push(`%${counterparty}%`)
    where.push(`lower(coalesce(u.full_name, '')) like $${params.length}`)
  }
  if (mode) {
    params.push(mode)
    where.push(`p.mode::text = $${params.length}`)
  }
  if (voucherNumber) {
    params.push(`%${voucherNumber}%`)
    where.push(`(
      lower(coalesce(p.receipt_number, '')) like $${params.length}
      or lower(coalesce(p.utr_reference, '')) like $${params.length}
      or lower(coalesce(p.bank_reference, '')) like $${params.length}
    )`)
  }

  const amountFilters: string[] = []

  if (minAmount !== null) {
    params.push(minAmount)
    amountFilters.push(`sum(pa.allocated_amount) >= $${params.length}`)
  }
  if (maxAmount !== null) {
    params.push(maxAmount)
    amountFilters.push(`sum(pa.allocated_amount) <= $${params.length}`)
  }
  if (highValueOnly && highValueThreshold > 0) {
    params.push(highValueThreshold)
    amountFilters.push(`sum(pa.allocated_amount) >= $${params.length}`)
  }

  const result = await pool.query<{ income_total: string }>(
    `
      with cam_category as (
        select id
        from transaction_categories
        where code = 'INC-MNT-001'
          and transaction_type = 'INCOME'
        limit 1
      ),
      cam_payments as (
        select sum(pa.allocated_amount) as amount
        from payment_allocations pa
        join payments p on p.id = pa.payment_id
        join maintenance_dues md on md.id = pa.maintenance_due_id
        join billing_periods bp on bp.id = md.billing_period_id
        join flats f on f.id = md.flat_id
        join blocks b on b.id = f.block_id
        left join users u on u.id = p.payer_user_id
        cross join cam_category cc
        where ${where.join(' and ')}
        group by p.id
        ${amountFilters.length > 0 ? `having ${amountFilters.join(' and ')}` : ''}
      )
      select coalesce(sum(amount), 0)::text as income_total
      from cam_payments
    `,
    params,
  )

  return Number(result.rows[0]?.income_total ?? 0)
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

export const getIncomeReportDrilldownTransactions = async (
  pool: Pool,
  societyId: string,
  query: Record<string, unknown>,
  options: {
    page: number
    pageSize: number
    orderBy: string
    sortDirection: 'asc' | 'desc'
  },
): Promise<{
  items: FinanceTransaction[]
  total: number
  summary: FinanceTransactionSummary
}> => {
  const search = queryText(query.search).trim().toLowerCase()
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

  const regularParams: unknown[] = [societyId]
  const regularWhere = [
    't.society_id = $1',
    "t.transaction_type = 'INCOME'",
    "t.status = 'POSTED'",
    "tc.code <> 'INC-MNT-001'",
  ]

  if (search) {
    regularParams.push(`%${search}%`)
    regularWhere.push(`(
      lower(t.title) like $${regularParams.length}
      or lower(coalesce(t.counterparty_name, '')) like $${regularParams.length}
      or lower(coalesce(t.voucher_number, '')) like $${regularParams.length}
      or lower(tc.name) like $${regularParams.length}
    )`)
  }
  if (categoryId) {
    regularParams.push(categoryId)
    regularWhere.push(`t.category_id = $${regularParams.length}`)
  }
  if (bankAccountId) {
    regularParams.push(bankAccountId)
    regularWhere.push(`t.bank_account_id = $${regularParams.length}`)
  }
  if (billingPeriodId) {
    regularParams.push(billingPeriodId)
    regularWhere.push(`t.billing_period_id = $${regularParams.length}`)
  }
  if (dateFrom) {
    regularParams.push(dateFrom)
    regularWhere.push(`t.transaction_date >= $${regularParams.length}`)
  }
  if (dateTo) {
    regularParams.push(dateTo)
    regularWhere.push(`t.transaction_date <= $${regularParams.length}`)
  }
  if (counterparty) {
    regularParams.push(`%${counterparty}%`)
    regularWhere.push(`lower(coalesce(t.counterparty_name, '')) like $${regularParams.length}`)
  }
  if (voucherNumber) {
    regularParams.push(`%${voucherNumber}%`)
    regularWhere.push(`lower(coalesce(t.voucher_number, '')) like $${regularParams.length}`)
  }
  if (mode) {
    regularParams.push(`%mode: ${mode}%`)
    regularWhere.push(`lower(coalesce(t.description, '')) like $${regularParams.length}`)
  }
  if (minAmount !== null) {
    regularParams.push(minAmount)
    regularWhere.push(`t.amount >= $${regularParams.length}`)
  }
  if (maxAmount !== null) {
    regularParams.push(maxAmount)
    regularWhere.push(`t.amount <= $${regularParams.length}`)
  }
  if (highValueOnly && highValueThreshold > 0) {
    regularParams.push(highValueThreshold)
    regularWhere.push(`t.amount >= $${regularParams.length}`)
  }
  if (attachment === 'present') {
    regularWhere.push('coalesce(ta_counts.attachment_count, 0) > 0')
  } else if (attachment === 'missing') {
    regularWhere.push('coalesce(ta_counts.attachment_count, 0) = 0')
  }

  const regularRows = await pool.query<FinanceTransactionRow>(
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
      where ${regularWhere.join(' and ')}
    `,
    regularParams,
  )

  let camItems: FinanceTransaction[] = []

  if (
    attachment !== 'present' &&
    !bankAccountId &&
    !mode
  ) {
    const camParams: unknown[] = [societyId]
    const camWhere = [
      'p.society_id = $1',
      "p.status = 'VERIFIED'",
      "bp.charge_type = 'CAM'",
      `not exists (
        select 1
        from transactions source_t
        join transaction_categories source_tc on source_tc.id = source_t.category_id
        where source_t.source_payment_id = p.id
          and source_t.society_id = p.society_id
          and source_t.transaction_type = 'INCOME'
          and source_t.status = 'POSTED'
          and source_tc.code = 'INC-MNT-001'
      )`,
    ]

    if (categoryId) {
      camParams.push(categoryId)
      camWhere.push(`cc.id = $${camParams.length}`)
    }
    if (billingPeriodId) {
      camParams.push(billingPeriodId)
      camWhere.push(`bp.id = $${camParams.length}`)
    }
    if (dateFrom) {
      camParams.push(dateFrom)
      camWhere.push(`p.payment_date >= $${camParams.length}`)
    }
    if (dateTo) {
      camParams.push(dateTo)
      camWhere.push(`p.payment_date <= $${camParams.length}`)
    }
    if (search) {
      camParams.push(`%${search}%`)
      camWhere.push(`(
        lower(cc.name) like $${camParams.length}
        or lower(coalesce(u.full_name, '')) like $${camParams.length}
        or lower(coalesce(f.flat_number, '')) like $${camParams.length}
        or lower(coalesce(b.name, '')) like $${camParams.length}
        or lower(coalesce(p.receipt_number, '')) like $${camParams.length}
        or lower(coalesce(p.utr_reference, '')) like $${camParams.length}
        or lower(coalesce(p.bank_reference, '')) like $${camParams.length}
        or lower(coalesce(bp.label, '')) like $${camParams.length}
        or lower(coalesce(p.notes, '')) like $${camParams.length}
      )`)
    }
    if (counterparty) {
      camParams.push(`%${counterparty}%`)
      camWhere.push(`lower(coalesce(u.full_name, '')) like $${camParams.length}`)
    }
    if (voucherNumber) {
      camParams.push(`%${voucherNumber}%`)
      camWhere.push(`(
        lower(coalesce(p.receipt_number, '')) like $${camParams.length}
        or lower(coalesce(p.utr_reference, '')) like $${camParams.length}
        or lower(coalesce(p.bank_reference, '')) like $${camParams.length}
      )`)
    }

    const amountFilters: string[] = []

    if (minAmount !== null) {
      camParams.push(minAmount)
      amountFilters.push(`sum(pa.allocated_amount) >= $${camParams.length}`)
    }
    if (maxAmount !== null) {
      camParams.push(maxAmount)
      amountFilters.push(`sum(pa.allocated_amount) <= $${camParams.length}`)
    }
    if (highValueOnly && highValueThreshold > 0) {
      camParams.push(highValueThreshold)
      amountFilters.push(`sum(pa.allocated_amount) >= $${camParams.length}`)
    }

    const camRows = await pool.query<IncomeReportDrilldownCamRow>(
      `
        with cam_category as (
          select id, name, category_group
          from transaction_categories
          where code = 'INC-MNT-001'
            and transaction_type = 'INCOME'
          limit 1
        )
        select
          p.id as payment_id,
          p.society_id,
          cc.id as category_id,
          cc.name as category_name,
          cc.category_group,
          case when count(distinct bp.id) = 1 then min(bp.id::text)::uuid else null end as billing_period_id,
          case when count(distinct bp.label) = 1 then min(bp.label) else null end as billing_period_label,
          case
            when count(distinct bp.label) = 1 then concat('CAM collection - ', min(bp.label))
            else 'CAM collection - multiple periods'
          end as title,
          coalesce(p.notes, null) as description,
          coalesce(u.full_name, '-') as counterparty_name,
          coalesce(p.receipt_number, p.utr_reference, p.bank_reference, '-') as voucher_number,
          p.payment_date::text as transaction_date,
          sum(pa.allocated_amount)::text as amount,
          'POSTED'::text as status,
          p.created_at::text as created_at,
          p.updated_at::text as updated_at
        from payment_allocations pa
        join payments p on p.id = pa.payment_id
        join maintenance_dues md on md.id = pa.maintenance_due_id
        join billing_periods bp on bp.id = md.billing_period_id
        join flats f on f.id = md.flat_id
        join blocks b on b.id = f.block_id
        left join users u on u.id = p.payer_user_id
        cross join cam_category cc
        where ${camWhere.join(' and ')}
        group by p.id, p.society_id, p.payment_date, p.created_at, p.updated_at, cc.id, cc.name, cc.category_group, u.full_name, p.receipt_number, p.utr_reference, p.bank_reference, p.notes
        ${amountFilters.length > 0 ? `having ${amountFilters.join(' and ')}` : ''}
      `,
      camParams,
    )

    camItems = camRows.rows.map(incomeReportDrilldownTransactionFromCamRow)
  }

  const items = sortFinanceTransactions(
    [...regularRows.rows.map(financeTransactionFromRow), ...camItems],
    options.orderBy,
    options.sortDirection,
  )
  const total = items.length
  const pagedItems = items.slice((options.page - 1) * options.pageSize, options.page * options.pageSize)

  return {
    items: pagedItems,
    total,
    summary: {
      total,
      income: items.reduce((sum, item) => sum + item.amount, 0),
      expense: 0,
      missingAttachments: items.filter((item) => !item.hasAttachments).length,
    },
  }
}
