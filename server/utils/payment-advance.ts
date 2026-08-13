import type { BillingPeriodChargeType } from '~/types/domain'

export type AdvanceCreditContext = {
  applicableChargeType: BillingPeriodChargeType | null
  sourceBillingPeriodId: string | null
}

export type AdvanceCreditScope = BillingPeriodChargeType | 'ANY_BILL'

type ScopedPaymentAllocation = {
  billingPeriodChargeType: BillingPeriodChargeType
  allocatedAmount: number
}

type AdvanceAllocationLine = {
  billingPeriodId: string
  billingPeriodChargeType: BillingPeriodChargeType
}

export const resolveAdvanceCreditContext = (
  lines: AdvanceAllocationLine[],
): AdvanceCreditContext => {
  const chargeType = lines[0]?.billingPeriodChargeType
  if (
    lines.length === 0 ||
    !chargeType ||
    lines.some((line) => line.billingPeriodChargeType !== chargeType)
  ) {
    return {
      applicableChargeType: null,
      sourceBillingPeriodId: null,
    }
  }

  const periodIds = new Set(lines.map((line) => line.billingPeriodId))

  return {
    applicableChargeType: chargeType,
    sourceBillingPeriodId:
      chargeType === 'DG_SET' && periodIds.size === 1
        ? (periodIds.values().next().value ?? null)
        : null,
  }
}

export const getAdvanceCreditScopeLabel = (
  applicableChargeType: BillingPeriodChargeType | null,
) => {
  if (applicableChargeType === 'DG_SET') return 'DG Set only'
  if (applicableChargeType === 'CAM') return 'CAM only'
  if (applicableChargeType === 'GENERAL') return 'General bills only'
  return 'Any non-DG bill'
}

export const getAdvanceApplicableChargeType = (
  scope: AdvanceCreditScope,
): BillingPeriodChargeType | null => (scope === 'ANY_BILL' ? null : scope)

export const getAdvanceCreditScope = (
  applicableChargeType: BillingPeriodChargeType | null,
): AdvanceCreditScope => applicableChargeType ?? 'ANY_BILL'

export const isAdvanceCreditEligibleForCharge = (
  applicableChargeType: BillingPeriodChargeType | null,
  targetChargeType: BillingPeriodChargeType,
) => applicableChargeType === targetChargeType

const closedDueStatuses = new Set(['PAID', 'WAIVED', 'CANCELLED'])

export const isAdvanceConsumptionAllowedForDueStatus = (status: string) =>
  !closedDueStatuses.has(status)

const getOutOfScopeAllocatedAmount = (
  lines: ScopedPaymentAllocation[],
  applicableChargeType: BillingPeriodChargeType | null,
) => Math.round(
  lines.reduce(
    (sum, line) => sum + (
      isAdvanceCreditEligibleForCharge(
        applicableChargeType,
        line.billingPeriodChargeType,
      )
        ? 0
        : Math.max(0, line.allocatedAmount)
    ),
    0,
  ) * 100,
) / 100

export const wouldApplyAdvanceOutsideScope = (input: {
  applicableChargeType: BillingPeriodChargeType | null
  previousAllocations: ScopedPaymentAllocation[]
  nextAllocations: ScopedPaymentAllocation[]
}) => getOutOfScopeAllocatedAmount(
  input.nextAllocations,
  input.applicableChargeType,
) > getOutOfScopeAllocatedAmount(
  input.previousAllocations,
  input.applicableChargeType,
)
