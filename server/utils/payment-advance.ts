import type { BillingPeriodChargeType } from '~/types/domain'

export type AdvanceCreditContext = {
  applicableChargeType: BillingPeriodChargeType | null
  sourceBillingPeriodId: string | null
}

type AdvanceAllocationLine = {
  billingPeriodId: string
  billingPeriodChargeType: BillingPeriodChargeType
}

export const resolveAdvanceCreditContext = (
  lines: AdvanceAllocationLine[],
): AdvanceCreditContext => {
  if (
    lines.length === 0 ||
    lines.some((line) => line.billingPeriodChargeType !== 'DG_SET')
  ) {
    return {
      applicableChargeType: null,
      sourceBillingPeriodId: null,
    }
  }

  const periodIds = new Set(lines.map((line) => line.billingPeriodId))

  return {
    applicableChargeType: 'DG_SET',
    sourceBillingPeriodId:
      periodIds.size === 1 ? (periodIds.values().next().value ?? null) : null,
  }
}

export const getAdvanceCreditScopeLabel = (
  applicableChargeType: BillingPeriodChargeType | null,
) => (applicableChargeType === 'DG_SET' ? 'DG Set only' : 'Any bill')
