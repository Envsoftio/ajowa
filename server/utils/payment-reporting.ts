export const isSyntheticAdvanceApplication = (paymentMode: string | null) =>
  paymentMode === 'ADVANCE_CREDIT'

export const getResidentLedgerReceiptAmount = (input: {
  paymentAmount: number
  paymentMode: string | null
  alreadyCounted: boolean
}) => {
  if (
    input.alreadyCounted ||
    isSyntheticAdvanceApplication(input.paymentMode)
  ) {
    return 0
  }

  return Number.isFinite(input.paymentAmount) ? input.paymentAmount : 0
}

export const getResidentLedgerEntryLabel = (paymentMode: string | null) =>
  isSyntheticAdvanceApplication(paymentMode)
    ? 'Advance applied'
    : (paymentMode?.replaceAll('_', ' ') ?? '-')
