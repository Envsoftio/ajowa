export type DgLateFeePolicy = {
  dgLateFeeEnabled: boolean
  dgGraceDays: number
  dgLateFeePerDay: number
}

export const disabledDgLateFeePolicy: DgLateFeePolicy = {
  dgLateFeeEnabled: false,
  dgGraceDays: 0,
  dgLateFeePerDay: 0,
}

export const resolveEffectiveLateFeePolicy = (input: {
  chargeType: string | null | undefined
  graceDays: number
  lateFeePerDay: number
  dgPolicy?: DgLateFeePolicy
}) => {
  if (input.chargeType !== 'DG_SET') {
    return {
      graceDays: input.graceDays,
      lateFeePerDay: input.lateFeePerDay,
    }
  }

  const policy = input.dgPolicy ?? disabledDgLateFeePolicy
  return {
    graceDays: policy.dgGraceDays,
    lateFeePerDay: policy.dgLateFeeEnabled ? policy.dgLateFeePerDay : 0,
  }
}
