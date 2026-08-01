export const getDgAdvanceRegisterStatePredicate = (
  state: string | undefined,
) => {
  if (state === 'active') {
    return "rac.status = 'ACTIVE' and rac.current_balance > 0"
  }
  if (state === 'consumed') {
    return "(rac.status = 'CONSUMED' or rac.current_balance = 0)"
  }
  if (state === 'inactive') {
    return "rac.status in ('ADJUSTED', 'EXPIRED', 'REVERSED')"
  }
  return null
}

export const isDedicatedDgAdvanceAllocation = (input: {
  allocationMode?: string | undefined
  advanceCreditScope?: string | undefined
  selectedDueIds?: readonly string[] | undefined
}) =>
  input.allocationMode === 'ADVANCE_ONLY' &&
  input.advanceCreditScope === 'DG_SET' &&
  (input.selectedDueIds?.length ?? 0) === 0
