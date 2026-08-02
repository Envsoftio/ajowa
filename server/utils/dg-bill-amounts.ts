export type DgBillAmountSummaryInput = {
  currentChargeAmount: number
  previousOutstandingAmount: number
  previousReferenceAmount: number
  interestAmount: number
  lateFeeAmount: number
  paidAmount: number
  waivedAmount: number
  balanceAmount: number
}

export type DgBillAmountSummary = {
  currentChargeAmount: number
  previousOutstandingAmount: number
  previousReferenceAmount: number
  interestAmount: number
  lateFeeAmount: number
  grossAmount: number
  paidOrAdvanceAmount: number
  waivedAmount: number
  netPayable: number
}

export type BillPdfAmountAllocationInput = {
  hasDgSection: boolean
  maintenanceSectionTotal: number | null
  mixedDgComponentAmount: number
  currentDueBalanceAmount: number
  previousOutstandingAmount: number
}

export type BillPdfAmountAllocation = {
  dgSectionBalanceAmount: number | null
  totalPayable: number
}

const roundMoney = (value: number) =>
  Math.max(0, Math.round((Number.isFinite(value) ? value : 0) * 100) / 100)

const roundSignedMoney = (value: number) =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100

/**
 * Allocates the authoritative due balance to the sections printed in the PDF.
 *
 * CAM-only bills keep their existing printed invoice total. Standalone DG bills
 * display the current due plus earlier open DG balances without copying those
 * balances into the current receivable. A
 * legacy mixed bill has no component-level payment allocation model, so its DG
 * section remains component-only instead of attributing due-level payments,
 * waivers, or late fees to DG. This keeps the existing CAM section unchanged
 * and prevents the full due balance from being printed a second time as DG.
 */
export const resolveBillPdfAmountAllocation = (
  input: BillPdfAmountAllocationInput,
): BillPdfAmountAllocation => {
  const maintenanceSectionTotal = input.maintenanceSectionTotal == null
    ? null
    : roundSignedMoney(input.maintenanceSectionTotal)
  const currentDueBalanceAmount = roundMoney(input.currentDueBalanceAmount)
  const previousOutstandingAmount = roundMoney(input.previousOutstandingAmount)
  const mixedDgComponentAmount = roundMoney(input.mixedDgComponentAmount)

  if (!input.hasDgSection) {
    return {
      dgSectionBalanceAmount: null,
      totalPayable: maintenanceSectionTotal
        ?? roundMoney(currentDueBalanceAmount + previousOutstandingAmount),
    }
  }

  if (maintenanceSectionTotal == null) {
    return {
      dgSectionBalanceAmount: roundMoney(currentDueBalanceAmount + previousOutstandingAmount),
      totalPayable: roundMoney(currentDueBalanceAmount + previousOutstandingAmount),
    }
  }

  return {
    dgSectionBalanceAmount: mixedDgComponentAmount,
    totalPayable: roundSignedMoney(
      maintenanceSectionTotal + mixedDgComponentAmount,
    ),
  }
}

export const resolveDgBillAmountSummary = (
  input: DgBillAmountSummaryInput,
): DgBillAmountSummary => {
  const currentChargeAmount = roundMoney(input.currentChargeAmount)
  const previousOutstandingAmount = roundMoney(input.previousOutstandingAmount)
  const previousReferenceAmount = roundMoney(input.previousReferenceAmount)
  const interestAmount = roundMoney(input.interestAmount)
  const lateFeeAmount = roundMoney(input.lateFeeAmount)

  return {
    currentChargeAmount,
    previousOutstandingAmount,
    previousReferenceAmount,
    interestAmount,
    lateFeeAmount,
    // Previous outstanding remains in its original due rows. It enters this
    // statement total only and is never copied into the current receivable.
    grossAmount: roundMoney(previousOutstandingAmount + currentChargeAmount + interestAmount + lateFeeAmount),
    paidOrAdvanceAmount: roundMoney(input.paidAmount),
    waivedAmount: roundMoney(input.waivedAmount),
    // The persisted due computation is authoritative after payments, advance
    // consumption, waivers, and any late-fee policy have been applied.
    netPayable: roundMoney(input.balanceAmount),
  }
}
