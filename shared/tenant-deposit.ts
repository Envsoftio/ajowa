export type TenantDepositDeductionType = 'DAMAGE' | 'PENALTY'

export const roundTenantMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100

export const calculateTenantDepositSettlementAmounts = (input: {
  receivedAmount: number
  deductions: Array<{
    deductionType: TenantDepositDeductionType
    amount: number
  }>
}) => {
  const receivedAmount = roundTenantMoney(input.receivedAmount)
  const damageDeductionAmount = roundTenantMoney(
    input.deductions
      .filter((item) => item.deductionType === 'DAMAGE')
      .reduce((sum, item) => sum + item.amount, 0),
  )
  const penaltyDeductionAmount = roundTenantMoney(
    input.deductions
      .filter((item) => item.deductionType === 'PENALTY')
      .reduce((sum, item) => sum + item.amount, 0),
  )
  const totalDeductionAmount = roundTenantMoney(
    damageDeductionAmount + penaltyDeductionAmount,
  )

  if (receivedAmount < 0 || totalDeductionAmount > receivedAmount) {
    throw new RangeError(
      'Deposit deductions cannot exceed the amount received.',
    )
  }

  return {
    receivedAmount,
    damageDeductionAmount,
    penaltyDeductionAmount,
    totalDeductionAmount,
    refundAmount: roundTenantMoney(receivedAmount - totalDeductionAmount),
  }
}
