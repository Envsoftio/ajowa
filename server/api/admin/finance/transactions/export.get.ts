import * as XLSX from 'xlsx/xlsx.mjs'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import {
  buildFinanceTransactionFilterSql,
  financeTransactionExportLimit,
  financeTransactionFromRow,
  getIncomeReportDrilldownTransactions,
  getFinanceTransactionRows,
  getFinanceTransactionSort,
  getFinanceTransactionSummary,
  type FinanceTransactionSummary,
} from '~/server/utils/finance-transactions'
import { createEventError, setEventHeader } from '~/server/utils/http-event'
import { getQuerySafe } from '~/server/utils/master-data'
import { createPdfBuffer, getSocietyStampImage } from '~/server/utils/pdf'
import { getSocietyInfo } from '~/server/utils/reports'
import type { FinanceTransaction } from '~/types/domain'

type ExportFormat = 'pdf' | 'xlsx'

const moneyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
})

const queryText = (value: unknown) => {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first : ''
}

const formatMoney = (value: number) => moneyFormatter.format(value)

const getExportFormat = (query: Record<string, unknown>): ExportFormat => {
  const format = queryText(query.format).toLowerCase() || 'pdf'
  if (format === 'pdf' || format === 'xlsx' || format === 'excel') {
    return format === 'pdf' ? 'pdf' : 'xlsx'
  }

  throw createEventError({
    statusCode: 400,
    message: 'Unsupported transaction export format.',
  })
}

const getExportTitle = (query: Record<string, unknown>) => {
  const type = queryText(query.transactionType).toUpperCase()
  if (type === 'INCOME') return 'Income Transactions'
  if (type === 'EXPENSE') return 'Expense Transactions'
  return 'Finance Transactions'
}

const getExportFileName = (query: Record<string, unknown>, extension: ExportFormat) => {
  const type = queryText(query.transactionType).toLowerCase()
  const prefix = type === 'income' || type === 'expense'
    ? `${type}-transactions`
    : 'finance-transactions'
  const today = new Date().toISOString().slice(0, 10)

  return `${prefix}-${today}.${extension}`
}

const filterDescription = (query: Record<string, unknown>) => {
  const parts = [
    queryText(query.transactionType) && `Type: ${queryText(query.transactionType)}`,
    queryText(query.status) && `Status: ${queryText(query.status)}`,
    queryText(query.dateFrom) && `From: ${queryText(query.dateFrom)}`,
    queryText(query.dateTo) && `To: ${queryText(query.dateTo)}`,
    queryText(query.search) && `Search: ${queryText(query.search)}`,
    queryText(query.counterparty) && `Party: ${queryText(query.counterparty)}`,
    queryText(query.voucherNumber) && `Voucher: ${queryText(query.voucherNumber)}`,
    queryText(query.attachment) && `Attachment: ${queryText(query.attachment)}`,
  ].filter(Boolean)

  return parts.length ? parts.join(' | ') : 'All transactions'
}

const mapWorkbookRow = (row: FinanceTransaction) => ({
  Date: row.transactionDate,
  Type: row.transactionType,
  Title: row.title,
  Voucher: row.voucherNumber ?? '',
  Category: row.categoryName,
  'Category group': row.categoryGroup,
  'Vendor/source': row.counterpartyName ?? '',
  Account: row.bankAccountName ?? '',
  'Billing period': row.billingPeriodLabel ?? '',
  Amount: row.amount,
  Status: row.status,
  'Journal voucher': row.journalVoucherNumber ?? '',
  'Expense payments': row.expensePaymentCount ?? 0,
  'Expense paid amount': row.expensePaymentTotal ?? 0,
  'Latest expense payment': row.latestExpensePaymentDate ?? '',
  Attachments: row.attachmentCount ?? 0,
  'Attachment required': row.attachmentRequired ? 'Yes' : 'No',
  'Created by': row.createdByName ?? '',
  'Approved by': row.approvedByName ?? '',
  'Approved at': row.approvedAt ?? '',
  'Posted at': row.postedAt ?? '',
  Description: row.description ?? '',
})

const buildWorkbook = (
  rows: FinanceTransaction[],
  summary: FinanceTransactionSummary,
  query: Record<string, unknown>,
) => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet(
    rows.length
      ? rows.map(mapWorkbookRow)
      : [{ Note: 'No transactions found for the selected filters.' }],
  )
  worksheet['!cols'] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 34 },
    { wch: 18 },
    { wch: 24 },
    { wch: 20 },
    { wch: 24 },
    { wch: 22 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
  ]

  const summarySheet = XLSX.utils.json_to_sheet([
    { Metric: 'Report', Value: getExportTitle(query) },
    { Metric: 'Filters', Value: filterDescription(query) },
    { Metric: 'Generated at', Value: new Date().toISOString() },
    { Metric: 'Matching rows', Value: summary.total },
    { Metric: 'Exported rows', Value: rows.length },
    { Metric: 'Total income', Value: summary.income },
    { Metric: 'Total expense', Value: summary.expense },
    { Metric: 'Missing attachments', Value: summary.missingAttachments },
  ])

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions')
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}

const buildPdf = async (
  rows: FinanceTransaction[],
  summary: FinanceTransactionSummary,
  query: Record<string, unknown>,
  societyId: string,
) => {
  const society = await getSocietyInfo(societyId)
  const stampImage = getSocietyStampImage()
  const body: unknown[][] = [
    [
      { text: 'Date', style: 'tableHeader' },
      { text: 'Type', style: 'tableHeader' },
      { text: 'Transaction', style: 'tableHeader' },
      { text: 'Category', style: 'tableHeader' },
      { text: 'Vendor/source', style: 'tableHeader' },
      { text: 'Account', style: 'tableHeader' },
      { text: 'Status', style: 'tableHeader' },
      { text: 'Amount', style: 'tableHeader', alignment: 'right' },
    ],
    ...rows.map((row) => [
      { text: row.transactionDate, style: 'tableCell' },
      { text: row.transactionType, style: 'tableCell' },
      { text: [row.title, row.voucherNumber ? `\n${row.voucherNumber}` : ''], style: 'tableCell' },
      { text: row.categoryName, style: 'tableCell' },
      { text: row.counterpartyName ?? '-', style: 'tableCell' },
      { text: row.bankAccountName ?? '-', style: 'tableCell' },
      { text: row.status, style: 'tableCell' },
      { text: formatMoney(row.amount), style: 'tableCell', alignment: 'right' },
    ]),
  ]

  if (body.length === 1) {
    body.push([
      { text: 'No transactions found for the selected filters.', colSpan: 8, style: 'tableCell' },
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ])
  }

  return await createPdfBuffer({
    pageOrientation: 'landscape',
    pageMargins: [28, 42, 28, 36],
    content: [
      { text: society.name, style: 'brand' },
      { text: society.address, style: 'subtle' },
      { text: getExportTitle(query), style: 'title' },
      { text: `${filterDescription(query)} | Generated ${new Date().toISOString()}`, style: 'subtle', margin: [0, 0, 0, 12] },
      {
        columns: [
          { text: `Income\n${formatMoney(summary.income)}`, style: 'summaryBox' },
          { text: `Expense\n${formatMoney(summary.expense)}`, style: 'summaryBox' },
          { text: `Entries\n${summary.total}`, style: 'summaryBox' },
          { text: `Missing files\n${summary.missingAttachments}`, style: 'summaryBox' },
        ],
        columnGap: 8,
        margin: [0, 0, 0, 12],
      },
      {
        table: {
          headerRows: 1,
          widths: ['9%', '9%', '23%', '14%', '15%', '12%', '9%', '9%'],
          body,
        },
        layout: 'lightHorizontalLines',
      },
      {
        text: summary.total > rows.length
          ? `Rows exported: ${rows.length} of ${summary.total}. Narrow the filters to export more specific results.`
          : `Rows exported: ${rows.length}`,
        style: 'footerNote',
        margin: [0, 10, 0, 0],
      },
      {
        columns: [
          {
            stack: [
              ...(stampImage
                ? [
                    {
                      image: stampImage,
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
            text: 'This is a system-generated finance transaction export.',
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
      title: { fontSize: 18, bold: true, color: '#2f4050', margin: [0, 10, 0, 4] },
      subtle: { fontSize: 8, color: '#768390' },
      summaryBox: { fontSize: 9, color: '#111827', bold: true, margin: [0, 6, 0, 6] },
      tableHeader: { bold: true, fontSize: 8, color: '#ffffff', fillColor: '#2a3f54' },
      tableCell: { fontSize: 7, color: '#2f4050' },
      signature: { fontSize: 8, color: '#111827', bold: true },
      footerNote: { fontSize: 8, color: '#768390', italics: true },
    },
    defaultStyle: { font: 'Roboto' },
  })
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = getQuerySafe(event)
  const format = getExportFormat(query)
  const pool = getDatabasePool()
  const sort = getFinanceTransactionSort(query)
  const isIncomeReportDrilldown = query.source === 'report' &&
    query.transactionType === 'INCOME' &&
    query.status === 'POSTED'

  let summary: FinanceTransactionSummary
  let rows: FinanceTransaction[]

  if (isIncomeReportDrilldown) {
    const result = await getIncomeReportDrilldownTransactions(
      pool,
      authMe.user.societyId,
      query,
      {
        page: 1,
        pageSize: financeTransactionExportLimit,
        ...sort,
      },
    )
    summary = result.summary
    rows = result.items
  } else {
    const filterSql = buildFinanceTransactionFilterSql(authMe.user.societyId, query)
    summary = await getFinanceTransactionSummary(pool, filterSql)
    const result = await getFinanceTransactionRows(pool, filterSql, {
      limit: financeTransactionExportLimit,
      ...sort,
    })
    rows = result.rows.map(financeTransactionFromRow)
  }

  const fileName = getExportFileName(query, format)

  if (format === 'pdf') {
    setEventHeader(event, 'content-type', 'application/pdf')
    setEventHeader(event, 'content-disposition', `attachment; filename="${fileName}"`)
    return await buildPdf(rows, summary, query, authMe.user.societyId)
  }

  setEventHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setEventHeader(event, 'content-disposition', `attachment; filename="${fileName}"`)
  return buildWorkbook(rows, summary, query)
})
