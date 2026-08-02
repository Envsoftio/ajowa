export type QrBillingPeriodCandidate = {
  id: string
  chargeType: string
  startDate: string
  endDate: string
  isFullyGenerated: boolean
}

export const QR_MONTHLY_GRACE_DAY = 10

const formatDateOnly = (date: Date) => date.toISOString().slice(0, 10)

export const getQrAccessValidThroughDate = (input: {
  periodStartDate: string
  periodEndDate: string
  coveredMonthCount: number
}) => {
  const periodStart = new Date(`${input.periodStartDate}T00:00:00Z`)
  const periodEnd = new Date(`${input.periodEndDate}T00:00:00Z`)

  if (
    Number.isNaN(periodStart.getTime()) ||
    Number.isNaN(periodEnd.getTime()) ||
    periodEnd < periodStart
  ) {
    return input.periodEndDate
  }

  const coveredMonthCount = Math.max(0, Math.trunc(input.coveredMonthCount))
  const checkpoint = new Date(Date.UTC(
    periodStart.getUTCFullYear(),
    periodStart.getUTCMonth() + coveredMonthCount,
    QR_MONTHLY_GRACE_DAY,
  ))
  const boundedCheckpoint = new Date(Math.min(
    periodEnd.getTime(),
    Math.max(periodStart.getTime(), checkpoint.getTime()),
  ))

  return formatDateOnly(boundedCheckpoint)
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
