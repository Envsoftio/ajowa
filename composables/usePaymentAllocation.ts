export const usePaymentAllocation = () => {
  const selectedBillingPeriodId = ref<string | null>(null)

  const clearAllocation = () => {
    selectedBillingPeriodId.value = null
  }

  return {
    selectedBillingPeriodId,
    clearAllocation,
  }
}
