export const useFinanceSharedReportLinks = () => {
  const buildTransactionDetailLink = (transactionId: string) =>
    `/admin/finance/transactions/${transactionId}`

  const buildTransactionCreateLink = (type: 'income' | 'expense') =>
    `/admin/finance/transactions/new?type=${type}`

  return {
    buildTransactionDetailLink,
    buildTransactionCreateLink,
  }
}
