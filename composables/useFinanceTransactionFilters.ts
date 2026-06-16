import type { FinanceLifecycleStatus, FinanceTransactionType } from '~/types/domain'

export type FinanceTransactionFilters = {
  search: string
  transactionType: '' | FinanceTransactionType
  status: '' | FinanceLifecycleStatus
  categoryId: string
  bankAccountId: string
  billingPeriodId: string
  dateFrom: string
  dateTo: string
  minAmount: number | null
  maxAmount: number | null
  counterparty: string
  attachment: '' | 'present' | 'missing'
  mode: string
  voucherNumber: string
  highValueOnly: boolean
}

export const useFinanceTransactionFilters = () => {
  const filters = reactive<FinanceTransactionFilters>({
    search: '',
    transactionType: '',
    status: '',
    categoryId: '',
    bankAccountId: '',
    billingPeriodId: '',
    dateFrom: '',
    dateTo: '',
    minAmount: null,
    maxAmount: null,
    counterparty: '',
    attachment: '',
    mode: '',
    voucherNumber: '',
    highValueOnly: false,
  })

  const resetFilters = () => {
    filters.search = ''
    filters.transactionType = ''
    filters.status = ''
    filters.categoryId = ''
    filters.bankAccountId = ''
    filters.billingPeriodId = ''
    filters.dateFrom = ''
    filters.dateTo = ''
    filters.minAmount = null
    filters.maxAmount = null
    filters.counterparty = ''
    filters.attachment = ''
    filters.mode = ''
    filters.voucherNumber = ''
    filters.highValueOnly = false
  }

  const applyQuickFilter = (key: string, highValueThreshold = 0) => {
    if (key === 'all') {
      resetFilters()
    } else if (key === 'expenses') {
      filters.transactionType = 'EXPENSE'
    } else if (key === 'income') {
      filters.transactionType = 'INCOME'
    } else if (key === 'this-month') {
      const now = new Date()
      filters.dateFrom = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .slice(0, 10)
      filters.dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10)
    } else if (key === 'pending') {
      filters.status = 'PENDING_REVIEW'
    } else if (key === 'missing') {
      filters.attachment = 'missing'
    } else if (key === 'high-value') {
      filters.highValueOnly = true
      filters.minAmount = highValueThreshold > 0 ? highValueThreshold : filters.minAmount
    }
  }

  const query = computed(() => ({
    search: filters.search || undefined,
    transactionType: filters.transactionType || undefined,
    status: filters.status || undefined,
    categoryId: filters.categoryId || undefined,
    bankAccountId: filters.bankAccountId || undefined,
    billingPeriodId: filters.billingPeriodId || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    minAmount: filters.minAmount ?? undefined,
    maxAmount: filters.maxAmount ?? undefined,
    counterparty: filters.counterparty || undefined,
    attachment: filters.attachment || undefined,
    mode: filters.mode || undefined,
    voucherNumber: filters.voucherNumber || undefined,
    highValueOnly: filters.highValueOnly ? 'true' : undefined,
  }))

  return {
    filters,
    query,
    resetFilters,
    applyQuickFilter,
  }
}
