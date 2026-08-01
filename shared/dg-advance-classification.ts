import { z } from 'zod'

export const dgAdvanceClassificationSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Enter a clear reason for classifying this receipt as DG advance.')
    .max(500),
})

export type DgAdvanceClassificationEligibilityInput = {
  paymentStatus: string
  paymentMode: string
  sourceCreditCount: number
  creditStatus: string
  originalAmount: string | number
  currentBalance: string | number
  applicableChargeType: string | null
  dependentHistoryCount: number
}

export type DgAdvanceClassificationEligibility =
  | { eligible: true }
  | {
      eligible: false
      code:
        | 'SOURCE_NOT_VERIFIED'
        | 'SYNTHETIC_SOURCE'
        | 'AMBIGUOUS_SOURCE_CREDIT'
        | 'CREDIT_NOT_ACTIVE'
        | 'CREDIT_ALREADY_CLASSIFIED'
        | 'CREDIT_NOT_FULLY_UNUSED'
        | 'DEPENDENT_HISTORY'
      message: string
    }

const toMoneyCents = (value: string | number) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? Math.round(numericValue * 100) : null
}

export const getDgAdvanceClassificationEligibility = (
  input: DgAdvanceClassificationEligibilityInput,
): DgAdvanceClassificationEligibility => {
  if (input.paymentStatus !== 'VERIFIED') {
    return {
      eligible: false,
      code: 'SOURCE_NOT_VERIFIED',
      message: 'Only a verified source payment can be classified as DG advance.',
    }
  }

  if (input.paymentMode === 'ADVANCE_CREDIT') {
    return {
      eligible: false,
      code: 'SYNTHETIC_SOURCE',
      message: 'An internal advance application cannot become a new DG advance.',
    }
  }

  if (input.sourceCreditCount !== 1) {
    return {
      eligible: false,
      code: 'AMBIGUOUS_SOURCE_CREDIT',
      message:
        'This payment does not have exactly one source advance credit and cannot be classified safely.',
    }
  }

  if (input.creditStatus !== 'ACTIVE') {
    return {
      eligible: false,
      code: 'CREDIT_NOT_ACTIVE',
      message: 'Only an active advance credit can be classified as DG advance.',
    }
  }

  if (input.applicableChargeType !== null) {
    return {
      eligible: false,
      code: 'CREDIT_ALREADY_CLASSIFIED',
      message: 'This advance credit already has an explicit bill scope.',
    }
  }

  const originalAmount = toMoneyCents(input.originalAmount)
  const currentBalance = toMoneyCents(input.currentBalance)
  if (
    originalAmount === null ||
    currentBalance === null ||
    originalAmount <= 0 ||
    currentBalance !== originalAmount
  ) {
    return {
      eligible: false,
      code: 'CREDIT_NOT_FULLY_UNUSED',
      message:
        'This advance has already been used or has an invalid balance and cannot be reclassified.',
    }
  }

  if (input.dependentHistoryCount > 0) {
    return {
      eligible: false,
      code: 'DEPENDENT_HISTORY',
      message:
        'This advance has dependent consumption or adjustment history and cannot be reclassified.',
    }
  }

  return { eligible: true }
}
