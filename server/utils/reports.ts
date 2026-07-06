import * as XLSX from 'xlsx/xlsx.mjs'
import { z } from 'zod'
import { AppError } from './errors'
import { getDatabasePool } from './database'
import { createPdfBuffer, getSocietyStampImage } from './pdf'

export const reportTypes = [
  'expense-summary',
  'income-summary',
  'income-only',
  'expense-only',
  'resident-payment-ledger',
  'collection',
  'defaulter',
  'income-expense',
  'profit-loss',
  'category-expense',
  'vendor-expense',
  'attachment-missing',
  'pending-review',
  'gate-access',
  'service-requests',
  'notification-campaign',
] as const

export const sharedReportTypes = [
  'INCOME_SUMMARY',
  'EXPENSE_SUMMARY',
  'INCOME_VS_EXPENSE',
  'CATEGORY_EXPENSE_SUMMARY',
  'FINANCIAL_STATEMENT',
] as const

export type ReportType = (typeof reportTypes)[number]
export type SharedReportType = (typeof sharedReportTypes)[number]
export type ExportFormat = 'pdf' | 'xlsx'

export type ReportColumn = {
  key: string
  label: string
  type?: 'text' | 'number' | 'money' | 'date' | 'datetime'
}

export type ReportFilters = {
  reportType: ReportType
  startDate: string
  endDate: string
  periodMode: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM'
  flatId: string | null
  ownerUserId: string | null
  categoryId: string | null
  status: string | null
  search: string
  limit: number
}

export type ReportData = {
  reportType: ReportType
  title: string
  generatedAt: string
  filters: ReportFilters
  columns: ReportColumn[]
  rows: Record<string, unknown>[]
  summary: Record<string, number | string>
  chart: Array<{ label: string; value: number; color: string }>
  reconciliation: Array<{ label: string; expected: number; actual: number; variance: number }>
  performanceMs: number
  rowCount: number
  truncated: boolean
}

type SocietyInfo = {
  name: string
  code: string
  address: string
}

type ReportQueryContext = {
  societyId: string
  filters: ReportFilters
  exportMode?: boolean
}

const reportTypeSchema = z.enum(reportTypes)
const sharedReportTypeSchema = z.enum(sharedReportTypes)

export const reportLabels: Record<ReportType, string> = {
  'expense-summary': 'Expense Summary',
  'income-summary': 'Income Summary',
  'income-only': 'Income Transactions',
  'expense-only': 'Expense Transactions',
  'resident-payment-ledger': 'Resident Payment Ledger',
  collection: 'Collection Report',
  defaulter: 'Defaulter List',
  'income-expense': 'Income and Expense Report',
  'profit-loss': 'P&L Statement',
  'category-expense': 'Category-wise Expense Breakdown',
  'vendor-expense': 'Vendor-wise Expense Summary',
  'attachment-missing': 'Attachment-Missing Expense Report',
  'pending-review': 'Pending Review and Rejected Finance Entries',
  'gate-access': 'Gate Access Log',
  'service-requests': 'Service Request Report',
  'notification-campaign': 'Notification Campaign History',
}

export const sharedReportTypeLabels: Record<SharedReportType, string> = {
  INCOME_SUMMARY: 'Income Summary',
  EXPENSE_SUMMARY: 'Expense Summary',
  INCOME_VS_EXPENSE: 'Combined Income and Expense Summary',
  CATEGORY_EXPENSE_SUMMARY: 'Category Expense Summary',
  FINANCIAL_STATEMENT: 'Statement Snapshot',
}

const toDateOnly = (date: Date) => date.toISOString().slice(0, 10)

const addMonths = (date: Date, months: number) => {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  copy.setUTCMonth(copy.getUTCMonth() + months)
  return copy
}

const startOfMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))

const endOfMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))

const parseDateUtc = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
}

const monthKey = (date: Date) => `m${date.getUTCFullYear()}_${String(date.getUTCMonth() + 1).padStart(2, '0')}`

const formatMonthLabel = (date: Date, month: 'short' | 'long' = 'short') =>
  new Intl.DateTimeFormat('en-US', { month, year: 'numeric', timeZone: 'UTC' })
    .format(date)
    .toUpperCase()

const buildMonthBuckets = (startDate: string, endDate: string) => {
  const end = startOfMonth(parseDateUtc(endDate))
  const buckets: Array<{ key: string; label: string; date: Date }> = []
  let cursor = startOfMonth(parseDateUtc(startDate))

  while (cursor <= end) {
    buckets.push({ key: monthKey(cursor), label: formatMonthLabel(cursor), date: cursor })
    cursor = addMonths(cursor, 1)
  }

  return buckets
}

const expenseSummaryTitle = (startDate: string, endDate: string) =>
  `SUMMARY OF EXPENSES : ${formatMonthLabel(parseDateUtc(startDate), 'long')} TO ${formatMonthLabel(parseDateUtc(endDate), 'long')}`

const incomeSummaryTitle = (startDate: string, endDate: string) =>
  `SUMMARY OF INCOME : ${formatMonthLabel(parseDateUtc(startDate), 'long')} TO ${formatMonthLabel(parseDateUtc(endDate), 'long')}`

const normalizeDateRange = (query: Record<string, unknown>) => {
  const mode = String(query.periodMode ?? 'MONTHLY') as ReportFilters['periodMode']
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  if (mode === 'CUSTOM') {
    return {
      periodMode: mode,
      startDate: String(query.startDate ?? toDateOnly(startOfMonth(today))),
      endDate: String(query.endDate ?? toDateOnly(endOfMonth(today))),
    }
  }

  const monthStart = startOfMonth(today)
  const ranges: Record<string, { start: Date; end: Date }> = {
    MONTHLY: { start: monthStart, end: endOfMonth(today) },
    QUARTERLY: { start: addMonths(monthStart, -2), end: endOfMonth(today) },
    HALF_YEARLY: { start: addMonths(monthStart, -5), end: endOfMonth(today) },
    YEARLY: { start: addMonths(monthStart, -11), end: endOfMonth(today) },
  }
  const selected = ranges[mode] ?? ranges.MONTHLY!

  return {
    periodMode: Object.hasOwn(ranges, mode) ? mode : 'MONTHLY',
    startDate: String(query.startDate ?? toDateOnly(selected.start)),
    endDate: String(query.endDate ?? toDateOnly(selected.end)),
  }
}

export const parseReportFilters = (
  query: Record<string, unknown>,
  overrides: Partial<ReportFilters> = {},
): ReportFilters => {
  const range = normalizeDateRange(query)
  const parsed = z
    .object({
      reportType: reportTypeSchema.default('income-expense'),
      startDate: z.string().date(),
      endDate: z.string().date(),
      periodMode: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM']).default('MONTHLY'),
      flatId: z.string().uuid().nullable().default(null),
      ownerUserId: z.string().uuid().nullable().default(null),
      categoryId: z.string().uuid().nullable().default(null),
      status: z.string().trim().max(80).nullable().default(null),
      search: z.string().trim().max(120).default(''),
      limit: z.coerce.number().int().min(1).max(10000).default(200),
    })
    .parse({
      ...query,
      ...range,
      flatId: query.flatId ? String(query.flatId) : null,
      ownerUserId: query.ownerUserId ? String(query.ownerUserId) : null,
      categoryId: query.categoryId ? String(query.categoryId) : null,
      status: query.status ? String(query.status) : null,
      ...overrides,
    })

  if (parsed.endDate < parsed.startDate) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'The report end date must be on or after the start date.',
    })
  }

  return parsed
}

export const parseSharedReportType = (value: unknown): SharedReportType => sharedReportTypeSchema.parse(value)

export const mapSharedTypeToReportType = (reportType: SharedReportType): ReportType => {
  if (reportType === 'INCOME_SUMMARY') return 'income-only'
  if (reportType === 'EXPENSE_SUMMARY') return 'expense-only'
  if (reportType === 'INCOME_VS_EXPENSE') return 'income-expense'
  if (reportType === 'CATEGORY_EXPENSE_SUMMARY') return 'category-expense'
  return 'profit-loss'
}

const money = (value: unknown) => Number(value ?? 0)

const chartColors = ['#0f766e', '#f59e0b', '#1d4ed8', '#7c3aed', '#b91c1c', '#15803d']
const chartColor = (index: number) => chartColors[index % chartColors.length] ?? '#0f766e'

const withLimit = (filters: ReportFilters, exportMode?: boolean) => (exportMode ? Math.min(filters.limit, 10000) : Math.min(filters.limit, 200))

const addSearch = (params: unknown[], filters: string[], columns: string[], search: string) => {
  if (!search) return
  params.push(`%${search.toLowerCase()}%`)
  filters.push(`(${columns.map((column) => `lower(coalesce(${column}, '')) like $${params.length}`).join(' or ')})`)
}

export const getSocietyInfo = async (societyId: string): Promise<SocietyInfo> => {
  const result = await getDatabasePool().query<{ name: string; code: string; address: string }>(
    `
      select
        name,
        code,
        concat_ws(', ', address_line_1, address_line_2, city, state, pincode) as address
      from society_profile
      where id = $1
      limit 1
    `,
    [societyId],
  )
  return result.rows[0] ?? { name: 'AJOWA', code: 'AJOWA', address: '' }
}

const getBillingReconciliation = async (societyId: string, startDate: string, endDate: string) => {
  const result = await getDatabasePool().query<{
    due_paid: string
    allocated: string
    due_balance: string
    defaulter_balance: string
  }>(
    `
      with dues as (
        select
          coalesce(sum(md.paid_amount), 0) as paid,
          coalesce(sum(md.balance_amount) filter (
            where md.status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE')
          ), 0) as balance
        from maintenance_dues md
        join billing_periods bp on bp.id = md.billing_period_id
        join flats f on f.id = md.flat_id
        where md.society_id = $1
          and bp.start_date <= $3
          and bp.end_date >= $2
      ),
      allocations as (
        select coalesce(sum(pa.allocated_amount), 0) as allocated
        from payment_allocations pa
        join maintenance_dues md on md.id = pa.maintenance_due_id
        join billing_periods bp on bp.id = md.billing_period_id
        where md.society_id = $1
          and bp.start_date <= $3
          and bp.end_date >= $2
      )
      select
        dues.paid::text as due_paid,
        allocations.allocated::text as allocated,
        dues.balance::text as due_balance,
        dues.balance::text as defaulter_balance
      from dues cross join allocations
    `,
    [societyId, startDate, endDate],
  )
  const row = result.rows[0]
  if (!row) return []

  return [
    {
      label: 'Due paid amount against allocations',
      expected: money(row.due_paid),
      actual: money(row.allocated),
      variance: money(row.due_paid) - money(row.allocated),
    },
    {
      label: 'Defaulter balance against open dues',
      expected: money(row.due_balance),
      actual: money(row.defaulter_balance),
      variance: 0,
    },
  ]
}

const buildMonthlyTransactionSummaryReport = async (
  { societyId, filters }: ReportQueryContext,
  transactionType: 'INCOME' | 'EXPENSE',
) => {
  const buckets = buildMonthBuckets(filters.startDate, filters.endDate)
  const params: unknown[] = [societyId, filters.startDate, filters.endDate, transactionType]
  const where = [
    't.society_id = $1',
    't.transaction_type = $4::transaction_type',
    "t.status = 'POSTED'",
    't.transaction_date between $2 and $3',
  ]

  if (filters.categoryId) {
    params.push(filters.categoryId)
    where.push(`t.category_id = $${params.length}`)
  }
  addSearch(params, where, ['tc.name', 'tc.category_group', 't.title', 't.counterparty_name', 't.voucher_number'], filters.search)

  const result = await getDatabasePool().query<{
    category_id: string
    description: string
    category_group: string
    month_start: string
    amount: string
  }>(
    `
      select
        tc.id as category_id,
        tc.name as description,
        tc.category_group,
        date_trunc('month', t.transaction_date)::date::text as month_start,
        sum(t.amount)::text as amount
      from transactions t
      join transaction_categories tc on tc.id = t.category_id
      where ${where.join(' and ')}
      group by tc.id, tc.category_group, tc.name, date_trunc('month', t.transaction_date)::date
      order by tc.category_group asc, tc.name asc
    `,
    params,
  )

  const rowsByDescription = new Map<string, Record<string, unknown>>()
  const totals = Object.fromEntries(buckets.map((bucket) => [bucket.key, 0])) as Record<string, number>

  for (const row of result.rows) {
    const key = row.category_id
    const bucketKey = monthKey(parseDateUtc(row.month_start))
    const amount = money(row.amount)
    if (!rowsByDescription.has(key)) {
      rowsByDescription.set(key, {
        description: row.description.toUpperCase(),
        categoryId: row.category_id,
        total: 0,
        ...Object.fromEntries(buckets.map((bucket) => [bucket.key, 0])),
      })
    }

    const item = rowsByDescription.get(key)!
    item[bucketKey] = Number(item[bucketKey] ?? 0) + amount
    item.total = Number(item.total ?? 0) + amount
    if (bucketKey in totals) totals[bucketKey] = (totals[bucketKey] ?? 0) + amount
  }

  const rows = Array.from(rowsByDescription.values())
  const grandTotal = buckets.reduce((sum, bucket) => sum + (totals[bucket.key] ?? 0), 0)
  const summaryKey = transactionType === 'INCOME' ? 'totalIncome' : 'totalExpense'
  rows.push({
    description: 'TOTAL AMOUNT',
    categoryId: null,
    ...totals,
    total: grandTotal,
  })

  return {
    columns: [
      { key: 'description', label: 'DESCRIPTION' },
      ...buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, type: 'money' as const })),
      { key: 'total', label: 'TOTAL', type: 'money' as const },
    ] satisfies ReportColumn[],
    rows,
    summary: {
      [summaryKey]: grandTotal,
      categoryCount: Math.max(rows.length - 1, 0),
      monthCount: buckets.length,
    },
    chart: buckets.map((bucket, index) => ({
      label: bucket.label,
      value: totals[bucket.key] ?? 0,
      color: chartColor(index),
    })),
  }
}

const buildExpenseSummaryReport = async (context: ReportQueryContext) =>
  buildMonthlyTransactionSummaryReport(context, 'EXPENSE')

const buildIncomeSummaryReport = async (context: ReportQueryContext) =>
  buildMonthlyTransactionSummaryReport(context, 'INCOME')

const buildFinanceTransactionReport = async ({ societyId, filters, exportMode }: ReportQueryContext) => {
  const params: unknown[] = [societyId, filters.startDate, filters.endDate]
  const where = ['t.society_id = $1', 't.transaction_date between $2 and $3']

  if (filters.categoryId) {
    params.push(filters.categoryId)
    where.push(`t.category_id = $${params.length}`)
  }
  addSearch(params, where, ['t.title', 't.counterparty_name', 't.voucher_number', 'tc.name'], filters.search)

  params.push(withLimit(filters, exportMode))
  const reportMode = filters.reportType
  const typeFilter =
    reportMode === 'income-only'
      ? "and t.transaction_type = 'INCOME'"
      : reportMode === 'expense-only' || reportMode === 'category-expense' || reportMode === 'vendor-expense' || reportMode === 'attachment-missing'
        ? "and t.transaction_type = 'EXPENSE'"
        : ''
  const statusFilter =
    reportMode === 'pending-review'
      ? "and t.status in ('PENDING_REVIEW', 'REJECTED', 'RETURNED')"
      : reportMode === 'attachment-missing'
        ? ''
        : "and t.status = 'POSTED'"
  const attachmentJoin = `
    left join (
      select transaction_id, count(*)::int as attachment_count
      from transaction_attachments
      where replaced_at is null
      group by transaction_id
    ) ta on ta.transaction_id = t.id
  `
  const missingAttachmentFilter =
    reportMode === 'attachment-missing' ? 'and tc.requires_attachment = true and coalesce(ta.attachment_count, 0) = 0' : ''

  if (reportMode === 'category-expense') {
    const result = await getDatabasePool().query<Record<string, string>>(
      `
        select
          tc.category_group as "categoryGroup",
          tc.name as category,
          count(*)::text as "entryCount",
          sum(t.amount)::text as amount
        from transactions t
        join transaction_categories tc on tc.id = t.category_id
        ${attachmentJoin}
        where ${where.join(' and ')}
          ${typeFilter}
          ${statusFilter}
          ${missingAttachmentFilter}
        group by tc.category_group, tc.name
        order by sum(t.amount) desc
        limit $${params.length}
      `,
      params,
    )
    const rows: Array<Record<string, unknown>> = result.rows.map((row) => ({ ...row, entryCount: Number(row.entryCount), amount: money(row.amount) }))
    const total = rows.reduce((sum, row) => sum + Number(row.amount), 0)
    return {
      columns: [
        { key: 'categoryGroup', label: 'Group' },
        { key: 'category', label: 'Category' },
        { key: 'entryCount', label: 'Entries', type: 'number' },
        { key: 'amount', label: 'Amount', type: 'money' },
      ] satisfies ReportColumn[],
      rows,
      summary: { totalExpense: total, categoryCount: rows.length },
      chart: rows.slice(0, 6).map((row, index) => ({ label: String(row.category), value: Number(row.amount), color: chartColor(index) })),
    }
  }

  if (reportMode === 'vendor-expense') {
    const result = await getDatabasePool().query<Record<string, string>>(
      `
        select
          coalesce(nullif(t.counterparty_name, ''), 'Unspecified') as vendor,
          count(*)::text as "entryCount",
          sum(t.amount)::text as amount
        from transactions t
        join transaction_categories tc on tc.id = t.category_id
        where ${where.join(' and ')}
          ${typeFilter}
          ${statusFilter}
        group by coalesce(nullif(t.counterparty_name, ''), 'Unspecified')
        order by sum(t.amount) desc
        limit $${params.length}
      `,
      params,
    )
    const rows: Array<Record<string, unknown>> = result.rows.map((row) => ({ ...row, entryCount: Number(row.entryCount), amount: money(row.amount) }))
    return {
      columns: [
        { key: 'vendor', label: 'Vendor' },
        { key: 'entryCount', label: 'Entries', type: 'number' },
        { key: 'amount', label: 'Amount', type: 'money' },
      ] satisfies ReportColumn[],
      rows,
      summary: {
        totalExpense: rows.reduce((sum, row) => sum + Number(row.amount), 0),
        vendorCount: rows.length,
      },
      chart: rows.slice(0, 6).map((row, index) => ({ label: String(row.vendor), value: Number(row.amount), color: chartColor(index) })),
    }
  }

  const result = await getDatabasePool().query<Record<string, string>>(
    `
      select
        t.transaction_date::text as "transactionDate",
        t.transaction_type::text as "transactionType",
        tc.name as category,
        t.title,
        coalesce(t.counterparty_name, '-') as counterparty,
        coalesce(t.voucher_number, '-') as "voucherNumber",
        t.status::text as status,
        t.amount::text as amount,
        coalesce(ta.attachment_count, 0)::text as "attachmentCount"
      from transactions t
      join transaction_categories tc on tc.id = t.category_id
      ${attachmentJoin}
      where ${where.join(' and ')}
        ${typeFilter}
        ${statusFilter}
        ${missingAttachmentFilter}
      order by t.transaction_date desc, t.created_at desc
      limit $${params.length}
    `,
    params,
  )
  const rows: Array<Record<string, unknown>> = result.rows.map((row) => ({
    ...row,
    amount: money(row.amount),
    attachmentCount: Number(row.attachmentCount),
  }))
  const income = rows.filter((row) => row.transactionType === 'INCOME').reduce((sum, row) => sum + Number(row.amount), 0)
  const expense = rows.filter((row) => row.transactionType === 'EXPENSE').reduce((sum, row) => sum + Number(row.amount), 0)
  const summary =
    reportMode === 'income-only'
      ? { totalIncome: income, entryCount: rows.length }
      : reportMode === 'expense-only'
        ? { totalExpense: expense, entryCount: rows.length }
        : { totalIncome: income, totalExpense: expense, netAmount: income - expense, entryCount: rows.length }
  const chart =
    reportMode === 'income-only'
      ? [{ label: 'Income', value: income, color: chartColor(0) }]
      : reportMode === 'expense-only'
        ? [{ label: 'Expense', value: expense, color: chartColor(1) }]
        : [
            { label: 'Income', value: income, color: chartColor(0) },
            { label: 'Expense', value: expense, color: chartColor(1) },
          ]

  return {
    columns: [
      { key: 'transactionDate', label: 'Date', type: 'date' },
      { key: 'transactionType', label: 'Type' },
      { key: 'category', label: 'Category' },
      { key: 'title', label: 'Title' },
      { key: 'counterparty', label: 'Counterparty' },
      { key: 'voucherNumber', label: 'Voucher' },
      { key: 'status', label: 'Status' },
      { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'attachmentCount', label: 'Files', type: 'number' },
    ] satisfies ReportColumn[],
    rows,
    summary,
    chart,
  }
}

const buildProfitLossReport = async ({ societyId, filters }: ReportQueryContext) => {
  const result = await getDatabasePool().query<Record<string, string>>(
    `
      with before_period as (
        select
          coalesce(sum(amount) filter (where transaction_type = 'INCOME'), 0) -
          coalesce(sum(amount) filter (where transaction_type = 'EXPENSE'), 0) as opening
        from transactions
        where society_id = $1 and status = 'POSTED' and transaction_date < $2
      ),
      period_totals as (
        select
          coalesce(sum(amount) filter (where transaction_type = 'INCOME'), 0) as income,
          coalesce(sum(amount) filter (where transaction_type = 'EXPENSE'), 0) as expense
        from transactions
        where society_id = $1 and status = 'POSTED' and transaction_date between $2 and $3
      )
      select
        before_period.opening::text as opening,
        period_totals.income::text as income,
        period_totals.expense::text as expense,
        (before_period.opening + period_totals.income - period_totals.expense)::text as closing
      from before_period cross join period_totals
    `,
    [societyId, filters.startDate, filters.endDate],
  )
  const row = result.rows[0] ?? { opening: '0', income: '0', expense: '0', closing: '0' }
  const rows = [
    { lineItem: 'Opening balance', amount: money(row.opening) },
    { lineItem: 'Income', amount: money(row.income) },
    { lineItem: 'Expense', amount: -money(row.expense) },
    { lineItem: 'Closing balance', amount: money(row.closing) },
  ]

  return {
    columns: [
      { key: 'lineItem', label: 'Line item' },
      { key: 'amount', label: 'Amount', type: 'money' },
    ] satisfies ReportColumn[],
    rows,
    summary: {
      openingBalance: money(row.opening),
      totalIncome: money(row.income),
      totalExpense: money(row.expense),
      closingBalance: money(row.closing),
    },
    chart: [
      { label: 'Opening', value: money(row.opening), color: chartColor(2) },
      { label: 'Income', value: money(row.income), color: chartColor(0) },
      { label: 'Expense', value: money(row.expense), color: chartColor(1) },
      { label: 'Closing', value: money(row.closing), color: chartColor(3) },
    ],
  }
}

const buildCollectionReport = async ({ societyId, filters, exportMode }: ReportQueryContext) => {
  const params: unknown[] = [societyId, filters.startDate, filters.endDate]
  const where = ['p.society_id = $1', 'p.payment_date between $2 and $3']
  if (filters.flatId) {
    params.push(filters.flatId)
    where.push(`p.received_for_flat_id = $${params.length}`)
  }
  addSearch(params, where, ['u.full_name', 'f.flat_number', 'p.receipt_number', 'p.utr_reference'], filters.search)
  params.push(withLimit(filters, exportMode))

  const result = await getDatabasePool().query<Record<string, string>>(
    `
      select
        p.payment_date::text as "paymentDate",
        coalesce(p.receipt_number, '-') as receipt,
        u.full_name as payer,
        concat(b.name, ' ', f.flat_number) as flat,
        p.mode::text as mode,
        p.status::text as status,
        p.amount::text as amount,
        coalesce(p.utr_reference, p.bank_reference, '-') as reference
      from payments p
      join users u on u.id = p.payer_user_id
      left join flats f on f.id = p.received_for_flat_id
      left join blocks b on b.id = f.block_id
      where ${where.join(' and ')}
      order by p.payment_date desc, p.created_at desc
      limit $${params.length}
    `,
    params,
  )
  const rows: Array<Record<string, unknown>> = result.rows.map((row) => ({ ...row, amount: money(row.amount) }))
  return {
    columns: [
      { key: 'paymentDate', label: 'Date', type: 'date' },
      { key: 'receipt', label: 'Receipt' },
      { key: 'payer', label: 'Payer' },
      { key: 'flat', label: 'Flat' },
      { key: 'mode', label: 'Mode' },
      { key: 'status', label: 'Status' },
      { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'reference', label: 'Reference' },
    ] satisfies ReportColumn[],
    rows,
    summary: {
      totalCollected: rows.reduce((sum, row) => sum + Number(row.amount), 0),
      paymentCount: rows.length,
    },
    chart: rows.reduce<Array<{ label: string; value: number; color: string }>>((items, row) => {
      const existing = items.find((item) => item.label === row.mode)
      if (existing) existing.value += Number(row.amount)
      else items.push({ label: String(row.mode), value: Number(row.amount), color: chartColor(items.length) })
      return items
    }, []),
  }
}

const buildDefaulterReport = async ({ societyId, filters, exportMode }: ReportQueryContext) => {
  const params: unknown[] = [societyId]
  const where = [
    "md.society_id = $1",
    "md.status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE')",
    'md.balance_amount > 0',
  ]
  if (filters.flatId) {
    params.push(filters.flatId)
    where.push(`md.flat_id = $${params.length}`)
  }
  addSearch(params, where, ['u.full_name', 'f.flat_number', 'bp.label'], filters.search)
  params.push(withLimit(filters, exportMode))

  const result = await getDatabasePool().query<Record<string, string>>(
    `
      select
        concat(b.name, ' ', f.flat_number) as flat,
        u.full_name as owner,
        bp.label as period,
        md.due_date::text as "dueDate",
        md.total_amount::text as "totalAmount",
        md.paid_amount::text as "paidAmount",
        md.balance_amount::text as "balanceAmount",
        greatest((current_date - md.due_date), 0)::text as "daysOverdue",
        coalesce((
          select item->>'camAdvanceNote'
          from jsonb_array_elements(
            case
              when jsonb_typeof(md.charge_breakdown) = 'array' then md.charge_breakdown
              else '[]'::jsonb
            end
          ) item
          where item ? 'camAdvanceNote'
          limit 1
        ), '') as "camAdvanceNote"
      from maintenance_dues md
      join billing_periods bp on bp.id = md.billing_period_id
      join flats f on f.id = md.flat_id
      join blocks b on b.id = f.block_id
      left join flat_residents fr on fr.flat_id = f.id and fr.relationship_type = 'OWNER' and fr.is_active = true
      left join users u on u.id = fr.user_id
      where ${where.join(' and ')}
      order by md.balance_amount desc, b.name, f.flat_number
      limit $${params.length}
    `,
    params,
  )
  const rows: Array<Record<string, unknown>> = result.rows.map((row) => ({
    ...row,
    totalAmount: money(row.totalAmount),
    paidAmount: money(row.paidAmount),
    balanceAmount: money(row.balanceAmount),
    daysOverdue: Number(row.daysOverdue),
  }))

  return {
    columns: [
      { key: 'flat', label: 'Flat' },
      { key: 'owner', label: 'Owner' },
      { key: 'period', label: 'Period' },
      { key: 'camAdvanceNote', label: 'CAM advance note' },
      { key: 'dueDate', label: 'Due date', type: 'date' },
      { key: 'totalAmount', label: 'Total', type: 'money' },
      { key: 'paidAmount', label: 'Paid', type: 'money' },
      { key: 'balanceAmount', label: 'Balance', type: 'money' },
      { key: 'daysOverdue', label: 'Days overdue', type: 'number' },
    ] satisfies ReportColumn[],
    rows,
    summary: {
      totalBalance: rows.reduce((sum, row) => sum + Number(row.balanceAmount), 0),
      flatCount: new Set(rows.map((row) => row.flat)).size,
    },
    chart: rows.slice(0, 6).map((row, index) => ({ label: String(row.flat), value: Number(row.balanceAmount), color: chartColor(index) })),
  }
}

const buildPaymentLedgerReport = async ({ societyId, filters, exportMode }: ReportQueryContext) => {
  const params: unknown[] = [societyId, filters.startDate, filters.endDate]
  const where = ['p.society_id = $1', 'p.payment_date between $2 and $3']
  if (filters.flatId) {
    params.push(filters.flatId)
    where.push(`p.received_for_flat_id = $${params.length}`)
  }
  if (filters.ownerUserId) {
    params.push(filters.ownerUserId)
    where.push(`p.payer_user_id = $${params.length}`)
  }
  params.push(withLimit(filters, exportMode))

  const result = await getDatabasePool().query<Record<string, string>>(
    `
      select
        p.payment_date::text as "paymentDate",
        concat(b.name, ' ', f.flat_number) as flat,
        u.full_name as resident,
        coalesce(p.receipt_number, '-') as receipt,
        bp.label as period,
        p.amount::text as "paymentAmount",
        pa.allocated_amount::text as "allocatedAmount",
        md.balance_amount::text as "remainingDueBalance",
        p.status::text as status
      from payments p
      join users u on u.id = p.payer_user_id
      left join flats f on f.id = p.received_for_flat_id
      left join blocks b on b.id = f.block_id
      left join payment_allocations pa on pa.payment_id = p.id
      left join maintenance_dues md on md.id = pa.maintenance_due_id
      left join billing_periods bp on bp.id = md.billing_period_id
      where ${where.join(' and ')}
      order by p.payment_date desc, p.created_at desc
      limit $${params.length}
    `,
    params,
  )
  const rows: Array<Record<string, unknown>> = result.rows.map((row) => ({
    ...row,
    paymentAmount: money(row.paymentAmount),
    allocatedAmount: money(row.allocatedAmount),
    remainingDueBalance: money(row.remainingDueBalance),
  }))

  return {
    columns: [
      { key: 'paymentDate', label: 'Payment date', type: 'date' },
      { key: 'flat', label: 'Flat' },
      { key: 'resident', label: 'Resident' },
      { key: 'receipt', label: 'Receipt' },
      { key: 'period', label: 'Period' },
      { key: 'paymentAmount', label: 'Payment', type: 'money' },
      { key: 'allocatedAmount', label: 'Allocated', type: 'money' },
      { key: 'remainingDueBalance', label: 'Remaining due', type: 'money' },
      { key: 'status', label: 'Status' },
    ] satisfies ReportColumn[],
    rows,
    summary: {
      totalPaid: rows.reduce((sum, row) => sum + Number(row.paymentAmount), 0),
      totalAllocated: rows.reduce((sum, row) => sum + Number(row.allocatedAmount), 0),
      rowCount: rows.length,
    },
    chart: [
      { label: 'Paid', value: rows.reduce((sum, row) => sum + Number(row.paymentAmount), 0), color: chartColor(0) },
      { label: 'Allocated', value: rows.reduce((sum, row) => sum + Number(row.allocatedAmount), 0), color: chartColor(1) },
    ],
  }
}

const buildGateAccessReport = async ({ societyId, filters, exportMode }: ReportQueryContext) => {
  const params: unknown[] = [societyId, filters.startDate, filters.endDate]
  const where = ['g.society_id = $1', 'g.scanned_at::date between $2 and $3']
  if (filters.status) {
    params.push(filters.status)
    where.push(`g.scan_result::text = $${params.length}`)
  }
  addSearch(params, where, ['u.full_name', 'f.flat_number', 'g.gate_name', 'g.denial_reason'], filters.search)
  params.push(withLimit(filters, exportMode))
  const result = await getDatabasePool().query<Record<string, string>>(
    `
      select
        g.scanned_at::text as "scannedAt",
        coalesce(u.full_name, '-') as resident,
        coalesce(concat(b.name, ' ', f.flat_number), '-') as flat,
        g.scan_result::text as result,
        coalesce(g.denial_reason, '-') as reason,
        coalesce(g.gate_name, '-') as gate
      from gate_scan_logs g
      left join users u on u.id = g.user_id
      left join flats f on f.id = g.flat_id
      left join blocks b on b.id = f.block_id
      where ${where.join(' and ')}
      order by g.scanned_at desc
      limit $${params.length}
    `,
    params,
  )
  const rows = result.rows
  return {
    columns: [
      { key: 'scannedAt', label: 'Scanned at', type: 'datetime' },
      { key: 'resident', label: 'Resident' },
      { key: 'flat', label: 'Flat' },
      { key: 'result', label: 'Result' },
      { key: 'reason', label: 'Reason' },
      { key: 'gate', label: 'Gate' },
    ] satisfies ReportColumn[],
    rows,
    summary: { scanCount: rows.length, deniedCount: rows.filter((row) => row.result !== 'GRANTED').length },
    chart: ['GRANTED', 'DENIED', 'EXPIRED', 'REVOKED', 'INVALID'].map((label, index) => ({
      label,
      value: rows.filter((row) => row.result === label).length,
      color: chartColor(index),
    })),
  }
}

const buildServiceRequestReport = async ({ societyId, filters, exportMode }: ReportQueryContext) => {
  const params: unknown[] = [societyId, filters.startDate, filters.endDate]
  const where = ['sr.society_id = $1', 'sr.created_at::date between $2 and $3']
  if (filters.status) {
    params.push(filters.status)
    where.push(`sr.status::text = $${params.length}`)
  }
  addSearch(params, where, ['sr.request_number', 'sr.title', 'sr.category', 'requester.full_name'], filters.search)
  params.push(withLimit(filters, exportMode))
  const result = await getDatabasePool().query<Record<string, string>>(
    `
      select
        sr.created_at::text as "createdAt",
        sr.request_number as "requestNumber",
        sr.title,
        sr.category,
        sr.priority::text as priority,
        sr.status::text as status,
        coalesce(sd.name, '-') as department,
        coalesce(assignee.full_name, '-') as assignee,
        coalesce(requester.full_name, '-') as requester,
        coalesce(concat(b.name, ' ', f.flat_number), sr.area_name, sr.asset_reference, '-') as location,
        sr.is_sla_breached::text as "slaBreached"
      from service_requests sr
      left join service_departments sd on sd.id = sr.department_id
      left join users assignee on assignee.id = sr.assignee_user_id
      left join users requester on requester.id = sr.requester_user_id
      left join flats f on f.id = sr.flat_id
      left join blocks b on b.id = f.block_id
      where ${where.join(' and ')}
      order by sr.created_at desc
      limit $${params.length}
    `,
    params,
  )
  const rows: Array<Record<string, unknown>> = result.rows.map((row) => ({ ...row, slaBreached: row.slaBreached === 'true' ? 'Yes' : 'No' }))
  return {
    columns: [
      { key: 'createdAt', label: 'Created', type: 'datetime' },
      { key: 'requestNumber', label: 'Ticket' },
      { key: 'title', label: 'Title' },
      { key: 'category', label: 'Category' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' },
      { key: 'department', label: 'Department' },
      { key: 'assignee', label: 'Assignee' },
      { key: 'requester', label: 'Requester' },
      { key: 'location', label: 'Location' },
      { key: 'slaBreached', label: 'SLA' },
    ] satisfies ReportColumn[],
    rows,
    summary: { requestCount: rows.length, breachedSla: rows.filter((row) => row.slaBreached === 'Yes').length },
    chart: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((label, index) => ({
      label,
      value: rows.filter((row) => row.status === label).length,
      color: chartColor(index),
    })),
  }
}

const buildNotificationReport = async ({ societyId, filters, exportMode }: ReportQueryContext) => {
  const params: unknown[] = [societyId, filters.startDate, filters.endDate]
  const where = ['ne.society_id = $1', 'ne.created_at::date between $2 and $3']
  if (filters.status) {
    params.push(filters.status)
    where.push(`ne.status::text = $${params.length}`)
  }
  addSearch(params, where, ['ne.event_key', 'ne.title', 'ne.body'], filters.search)
  params.push(withLimit(filters, exportMode))
  const result = await getDatabasePool().query<Record<string, string>>(
    `
      select
        ne.created_at::text as "createdAt",
        ne.event_key as "eventKey",
        ne.category::text as category,
        coalesce(ne.title, '-') as title,
        ne.status::text as status,
        count(nj.id)::text as jobs,
        count(nj.id) filter (where nj.status = 'FAILED')::text as failures
      from notification_events ne
      left join notification_jobs nj on nj.notification_event_id = ne.id
      where ${where.join(' and ')}
      group by ne.id
      order by ne.created_at desc
      limit $${params.length}
    `,
    params,
  )
  const rows: Array<Record<string, unknown>> = result.rows.map((row) => ({ ...row, jobs: Number(row.jobs), failures: Number(row.failures) }))
  return {
    columns: [
      { key: 'createdAt', label: 'Created', type: 'datetime' },
      { key: 'eventKey', label: 'Campaign' },
      { key: 'category', label: 'Category' },
      { key: 'title', label: 'Title' },
      { key: 'status', label: 'Status' },
      { key: 'jobs', label: 'Jobs', type: 'number' },
      { key: 'failures', label: 'Failures', type: 'number' },
    ] satisfies ReportColumn[],
    rows,
    summary: {
      campaignCount: rows.length,
      deliveryJobs: rows.reduce((sum, row) => sum + Number(row.jobs), 0),
      failedJobs: rows.reduce((sum, row) => sum + Number(row.failures), 0),
    },
    chart: [
      { label: 'Jobs', value: rows.reduce((sum, row) => sum + Number(row.jobs), 0), color: chartColor(0) },
      { label: 'Failures', value: rows.reduce((sum, row) => sum + Number(row.failures), 0), color: chartColor(4) },
    ],
  }
}

type ReportPayload = Pick<ReportData, 'columns' | 'rows' | 'summary' | 'chart'>

const buildPayload = async (context: ReportQueryContext): Promise<ReportPayload> => {
  if (context.filters.reportType === 'expense-summary') return buildExpenseSummaryReport(context)
  if (context.filters.reportType === 'income-summary') return buildIncomeSummaryReport(context)
  if (context.filters.reportType === 'resident-payment-ledger') return buildPaymentLedgerReport(context)
  if (context.filters.reportType === 'collection') return buildCollectionReport(context)
  if (context.filters.reportType === 'defaulter') return buildDefaulterReport(context)
  if (context.filters.reportType === 'profit-loss') return buildProfitLossReport(context)
  if (
    ['income-expense', 'income-only', 'expense-only', 'category-expense', 'vendor-expense', 'attachment-missing', 'pending-review'].includes(
      context.filters.reportType,
    )
  ) {
    return buildFinanceTransactionReport(context)
  }
  if (context.filters.reportType === 'gate-access') return buildGateAccessReport(context)
  if (context.filters.reportType === 'service-requests') return buildServiceRequestReport(context)
  return buildNotificationReport(context)
}

export const buildReport = async (context: ReportQueryContext): Promise<ReportData> => {
  const started = performance.now()
  const payload = await buildPayload(context)
  const reconciliation =
    context.filters.reportType === 'collection' || context.filters.reportType === 'defaulter'
      ? await getBillingReconciliation(context.societyId, context.filters.startDate, context.filters.endDate)
      : []
  const performanceMs = Math.round(performance.now() - started)

  return {
    reportType: context.filters.reportType,
    title: context.filters.reportType === 'expense-summary'
      ? expenseSummaryTitle(context.filters.startDate, context.filters.endDate)
      : context.filters.reportType === 'income-summary'
        ? incomeSummaryTitle(context.filters.startDate, context.filters.endDate)
        : reportLabels[context.filters.reportType],
    generatedAt: new Date().toISOString(),
    filters: context.filters,
    ...payload,
    reconciliation,
    performanceMs,
    rowCount: payload.rows.length,
    truncated: payload.rows.length >= withLimit(context.filters, context.exportMode),
  }
}

const formatCell = (column: ReportColumn, value: unknown) => {
  if (column.type === 'money') return Number(value ?? 0)
  if (column.type === 'number') return Number(value ?? 0)
  return value == null || value === '' ? '-' : String(value)
}

const summaryRows = (summary: ReportData['summary']) =>
  Object.entries(summary).map(([key, value]) => ({
    Metric: key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()),
    Value: value,
  }))

const generateMonthlySummaryWorkbook = (report: ReportData) => {
  const workbook = XLSX.utils.book_new()
  const table = [
    [report.title],
    report.columns.map((column) => column.label),
    ...report.rows.map((row) => report.columns.map((column) => formatCell(column, row[column.key]))),
  ]
  const sheet = XLSX.utils.aoa_to_sheet(table)
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(report.columns.length - 1, 0) } }]
  sheet['!cols'] = report.columns.map((column, index) => ({
    wch: index === 0 ? 42 : column.key === 'total' ? 16 : 14,
  }))
  XLSX.utils.book_append_sheet(workbook, sheet, report.reportType === 'income-summary' ? 'Income Summary' : 'Expense Summary')
  return Buffer.from(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }))
}

export const generateReportWorkbook = (report: ReportData) => {
  if (report.reportType === 'expense-summary' || report.reportType === 'income-summary') {
    return generateMonthlySummaryWorkbook(report)
  }

  const workbook = XLSX.utils.book_new()
  const rows = report.rows.map((row) =>
    Object.fromEntries(report.columns.map((column) => [column.label, formatCell(column, row[column.key])])),
  )
  const reportSheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No records found for the selected filters.' }])
  const summarySheet = XLSX.utils.json_to_sheet([
    { Metric: 'Report', Value: report.title },
    { Metric: 'Period', Value: `${report.filters.startDate} to ${report.filters.endDate}` },
    { Metric: 'Generated at', Value: report.generatedAt },
    { Metric: 'Performance ms', Value: report.performanceMs },
    ...summaryRows(report.summary),
  ])
  const reconciliationSheet = XLSX.utils.json_to_sheet(report.reconciliation)
  XLSX.utils.book_append_sheet(workbook, reportSheet, 'Report')
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')
  XLSX.utils.book_append_sheet(workbook, reconciliationSheet, 'Reconciliation')
  return Buffer.from(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }))
}

const formatPdfValue = (column: ReportColumn, value: unknown) => {
  if (column.type === 'money') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value ?? 0))
  }
  return String(formatCell(column, value))
}

export const generateReportPdf = async (report: ReportData, societyId?: string) => {
  const society = societyId ? await getSocietyInfo(societyId) : { name: 'AJOWA', code: 'AJOWA', address: '' }
  const reportStampImage = getSocietyStampImage()
  const tableBody: unknown[][] = [
    report.columns.map((column) => ({ text: column.label, style: 'tableHeader' })),
    ...report.rows.map((row) => report.columns.map((column) => ({ text: formatPdfValue(column, row[column.key]), style: 'tableCell' }))),
  ]
  if (tableBody.length === 1) {
    tableBody.push([{ text: 'No records found for the selected filters.', colSpan: report.columns.length, style: 'tableCell' }, ...report.columns.slice(1).map(() => '')])
  }

  const docDefinition = {
    pageOrientation: report.columns.length > 8 ? 'landscape' : 'portrait',
    pageMargins: [28, 42, 28, 36],
    content: [
      { text: society.name === 'AJOWA' ? 'AJOWA' : society.name, style: 'brand' },
      { text: report.title, style: 'title' },
      { text: `${report.filters.startDate} to ${report.filters.endDate} | Generated ${report.generatedAt}`, style: 'subtle' },
      {
        columns: Object.entries(report.summary).slice(0, 4).map(([key, value]) => ({
          text: `${key.replace(/([A-Z])/g, ' $1')}\n${value}`,
          style: 'summaryBox',
        })),
        columnGap: 8,
        margin: [0, 12, 0, 12],
      },
      {
        table: {
          headerRows: 1,
          widths: report.columns.map(() => `${100 / report.columns.length}%`),
          body: tableBody,
        },
        layout: 'lightHorizontalLines',
      },
      { text: `Rows: ${report.rowCount} | Generated in ${report.performanceMs} ms`, style: 'footerNote' },
      {
        columns: [
          {
            stack: [
              ...(reportStampImage
                ? [
                    {
                      image: reportStampImage,
                      fit: [112, 70],
                      margin: [0, 0, 0, 4],
                    },
                  ]
                : []),
              {
                text: [
                  `${society.name}\n`,
                  'Authorised Signatory',
                ],
                style: 'signature',
              },
            ],
          },
          {
            text: 'This is a system-generated society finance report.',
            style: 'footerNote',
            alignment: 'right',
          },
        ],
        columnGap: 16,
        margin: [0, 16, 0, 0],
      },
    ],
    styles: {
      brand: { fontSize: 10, color: '#0f766e', bold: true, margin: [0, 0, 0, 4] },
      title: { fontSize: 18, bold: true, color: '#2f4050', margin: [0, 0, 0, 4] },
      subtle: { fontSize: 8, color: '#768390' },
      summaryBox: { fontSize: 9, color: '#2f4050', fillColor: '#f7f8fa', margin: [6, 6, 6, 6] },
      tableHeader: { bold: true, fontSize: 8, color: '#ffffff', fillColor: '#2a3f54' },
      tableCell: { fontSize: 7, color: '#2f4050' },
      footerNote: { fontSize: 8, color: '#768390', margin: [0, 12, 0, 0] },
      signature: { fontSize: 8, color: '#111827', bold: true },
    },
    defaultStyle: { font: 'Roboto' },
  }

  return await createPdfBuffer(docDefinition)
}

export const buildReportFilename = (report: ReportData, extension: string) =>
  `${report.reportType}-${report.filters.startDate}-to-${report.filters.endDate}.${extension}`.replace(/[^a-z0-9._-]/gi, '-')

export const sanitizeSharedReport = (report: ReportData): ReportData => ({
  ...report,
  rows: report.rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).filter(([key]) => !key.toLowerCase().endsWith('id') && !key.toLowerCase().includes('journal')),
    ),
  ),
  columns: report.columns.filter(
    (column) => !column.key.toLowerCase().endsWith('id') && !column.key.toLowerCase().includes('journal'),
  ),
})
