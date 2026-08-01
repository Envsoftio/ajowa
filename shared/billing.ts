export const DG_DUE_GENERATION_BATCH_SIZE = 10
export const BILL_NOTIFICATION_REQUEST_BATCH_SIZE = 40

export const chunkBillingRequestIds = (
  ids: readonly string[],
  batchSize: number,
) => {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new RangeError('Billing request batch size must be a positive integer.')
  }

  const batches: string[][] = []
  for (let index = 0; index < ids.length; index += batchSize) {
    batches.push(ids.slice(index, index + batchSize))
  }

  return batches
}

export const getDueGenerationFlatIdBatches = (input: {
  chargeType: 'GENERAL' | 'CAM' | 'DG_SET'
  selectedFlatIds: readonly string[]
  availableFlatIds: readonly string[]
}): Array<string[] | undefined> => {
  if (input.chargeType !== 'DG_SET') {
    return [
      input.selectedFlatIds.length > 0
        ? [...input.selectedFlatIds]
        : undefined,
    ]
  }

  const targetFlatIds = input.selectedFlatIds.length > 0
    ? input.selectedFlatIds
    : input.availableFlatIds

  return chunkBillingRequestIds(
    targetFlatIds,
    DG_DUE_GENERATION_BATCH_SIZE,
  )
}

type DueGenerationTarget = {
  dueId: string
  flatId: string
}

export const getAdvanceConsumptionDueTargets = <T extends DueGenerationTarget>(
  input: {
    chargeType: 'GENERAL' | 'CAM' | 'DG_SET'
    generatedDues: readonly T[]
    skippedDues: readonly T[]
  },
) => {
  const candidates = input.chargeType === 'DG_SET'
    ? [...input.generatedDues, ...input.skippedDues]
    : [...input.generatedDues]

  return [
    ...new Map(candidates.map((due) => [due.dueId, due])).values(),
  ]
}
