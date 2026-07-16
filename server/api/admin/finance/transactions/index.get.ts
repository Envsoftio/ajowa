import { createApiSuccess, getPaginationParams } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import {
  buildFinanceTransactionFilterSql,
  financeTransactionFromRow,
  getFinanceTransactionRows,
  getIncomeReportDrilldownTransactions,
  getFinanceTransactionSort,
  getFinanceTransactionSummary,
} from '~/server/utils/finance-transactions'
import { getQuerySafe } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = getQuerySafe(event)
  const pagination = getPaginationParams(query)
  const offset = (pagination.page - 1) * pagination.pageSize
  const pool = getDatabasePool()
  const isIncomeReportDrilldown = query.source === 'report' &&
    query.transactionType === 'INCOME' &&
    query.status === 'POSTED'

  if (isIncomeReportDrilldown) {
    const sort = getFinanceTransactionSort(query)
    const result = await getIncomeReportDrilldownTransactions(
      pool,
      authMe.user.societyId,
      query,
      {
        page: pagination.page,
        pageSize: pagination.pageSize,
        ...sort,
      },
    )

    return createApiSuccess(event, {
      items: result.items,
      total: result.total,
      summary: {
        income: result.summary.income,
        expense: result.summary.expense,
        missingAttachments: result.summary.missingAttachments,
      },
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
  }

  const filterSql = buildFinanceTransactionFilterSql(authMe.user.societyId, query)
  const summary = await getFinanceTransactionSummary(pool, filterSql, query)
  const sort = getFinanceTransactionSort(query)
  const result = await getFinanceTransactionRows(pool, filterSql, {
    limit: pagination.pageSize,
    offset,
    ...sort,
  })

  return createApiSuccess(event, {
    items: result.rows.map(financeTransactionFromRow),
    total: summary.total,
    summary: {
      income: summary.income,
      expense: summary.expense,
      missingAttachments: summary.missingAttachments,
    },
    page: pagination.page,
    pageSize: pagination.pageSize,
  })
})
