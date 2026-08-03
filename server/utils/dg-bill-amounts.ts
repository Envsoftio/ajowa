export type DgBillAmountSummaryInput = {
  currentChargeAmount: number
  previousOutstandingAmount: number
  previousReferenceAmount: number
  interestAmount: number
  lateFeeAmount: number
  paidAmount: number
  advanceAppliedAmount: number
  availableAdvanceAmount?: number
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
  cashPaidAmount: number
  advanceAppliedAmount: number
  availableAdvanceAmount: number
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

export const getDgBillCurrentChargeLabel = (
  origin: string | null | undefined,
) => origin === 'DG_OPENING_BALANCE'
  ? 'CARRIED-FORWARD DG BALANCE'
  : 'CURRENT DG SET CHARGES'

export const resolveDgBillPreviousReferenceAmount = (input: {
  previousOutstandingAmount: number
  legacyReferenceAmount: number
}) => roundMoney(input.previousOutstandingAmount) > 0
  ? 0
  : roundMoney(input.legacyReferenceAmount)

/**
 * Allocates the authoritative due balance to the sections printed in the PDF.
 *
 * CAM-only bills keep their existing printed invoice total. Standalone DG bills
 * display the current due plus earlier open DG balances without copying those
 * balances into the current receivable. A
 * legacy mixed bill has no component-level payment allocation model, so its DG
 * section includes only its DG component plus earlier DG balances instead of
 * attributing due-level payments, waivers, or late fees to DG. The CAM section
 * receives only non-DG prior balances, keeping the two charge types separate.
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
    dgSectionBalanceAmount: roundMoney(
      mixedDgComponentAmount + previousOutstandingAmount,
    ),
    totalPayable: roundSignedMoney(
      maintenanceSectionTotal + mixedDgComponentAmount + previousOutstandingAmount,
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
  const paidOrAdvanceAmount = roundMoney(input.paidAmount)
  const advanceAppliedAmount = roundMoney(
    Math.min(paidOrAdvanceAmount, input.advanceAppliedAmount),
  )
  const availableAdvanceAmount = roundMoney(input.availableAdvanceAmount ?? 0)

  return {
    currentChargeAmount,
    previousOutstandingAmount,
    previousReferenceAmount,
    interestAmount,
    lateFeeAmount,
    // Previous outstanding remains in its original due rows. It enters this
    // statement total only and is never copied into the current receivable.
    grossAmount: roundMoney(previousOutstandingAmount + currentChargeAmount + interestAmount + lateFeeAmount),
    cashPaidAmount: roundMoney(paidOrAdvanceAmount - advanceAppliedAmount),
    advanceAppliedAmount,
    availableAdvanceAmount,
    paidOrAdvanceAmount,
    waivedAmount: roundMoney(input.waivedAmount),
    // The persisted due computation is authoritative after payments, advance
    // consumption, waivers, and any late-fee policy have been applied.
    netPayable: roundMoney(input.balanceAmount),
  }
}
