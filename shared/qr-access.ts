export type QrBillingPeriodCandidate = {
  id: string
  chargeType: string
  startDate: string
  endDate: string
  isFullyGenerated: boolean
}

const chargeTypePriority = (chargeType: string) =>
  chargeType === 'CAM' ? 0 : 1

export const selectCurrentQrBillingPeriodId = (
  periods: QrBillingPeriodCandidate[],
) =>
  periods
    .toSorted((left, right) => {
      const chargePriority =
        chargeTypePriority(left.chargeType) -
        chargeTypePriority(right.chargeType)
      if (chargePriority !== 0) return chargePriority

      const duePriority =
        Number(right.isFullyGenerated) - Number(left.isFullyGenerated)
      if (duePriority !== 0) return duePriority

      const startDatePriority = right.startDate.localeCompare(left.startDate)
      if (startDatePriority !== 0) return startDatePriority

      return left.endDate.localeCompare(right.endDate)
    })[0]?.id ?? null
