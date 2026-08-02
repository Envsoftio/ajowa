export type DgBalanceSummaryAmounts = {
  principalAmount: number
  interestAmount: number
  lateFeeAmount: number
  totalBilledAmount: number
  cashPaidAmount: number
  advanceAppliedAmount: number
  waivedAmount: number
  outstandingAmount: number
  availableAdvanceAmount: number
  netPositionAmount: number
}

const money = (value: number) =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100

export const buildDgBalanceSummary = (
  input: Omit<DgBalanceSummaryAmounts, 'netPositionAmount'>,
): DgBalanceSummaryAmounts => {
  const summary = {
    principalAmount: money(input.principalAmount),
    interestAmount: money(input.interestAmount),
    lateFeeAmount: money(input.lateFeeAmount),
    totalBilledAmount: money(input.totalBilledAmount),
    cashPaidAmount: money(input.cashPaidAmount),
    advanceAppliedAmount: money(input.advanceAppliedAmount),
    waivedAmount: money(input.waivedAmount),
    outstandingAmount: money(input.outstandingAmount),
    availableAdvanceAmount: money(input.availableAdvanceAmount),
  }

  return {
    ...summary,
    netPositionAmount: money(
      Math.max(0, summary.outstandingAmount - summary.availableAdvanceAmount),
    ),
  }
}

export const getDgBalanceStatePredicate = (state: string | undefined) => {
  if (state === 'outstanding') return 'md.balance_amount > 0'
  if (state === 'settled') return 'md.balance_amount = 0'
  if (state === 'opening') return "md.origin = 'DG_OPENING_BALANCE'"
  return null
}
