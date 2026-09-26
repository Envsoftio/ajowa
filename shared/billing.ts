export const DG_DUE_GENERATION_BATCH_SIZE = 10
export const CAM_DUE_GENERATION_BATCH_SIZE = 40
export const BILL_NOTIFICATION_REQUEST_BATCH_SIZE = 40
export const BILLING_BATCH_MAX_ATTEMPTS = 3

type BillingBatchRetryContext = {
  failedAttempt: number
  nextAttempt: number
  maxAttempts: number
  delayMs: number
  error: unknown
}

type BillingBatchRetryOptions = {
  maxAttempts?: number
  wait?: (milliseconds: number) => Promise<void>
  onRetry?: (context: BillingBatchRetryContext) => void | Promise<void>
}

const getBillingBatchErrorStatus = (error: unknown) => {
  const candidate = error as {
    status?: unknown
    statusCode?: unknown
    response?: { status?: unknown }
  }
  const rawStatus =
    candidate?.statusCode ?? candidate?.status ?? candidate?.response?.status
  const status = Number(rawStatus)

  return Number.isInteger(status) && status > 0 ? status : null
}

export const isRetryableBillingBatchError = (error: unknown) => {
  const status = getBillingBatchErrorStatus(error)

  return status == null || status === 408 || status === 425 || status === 429 || status >= 500
}

export const getBillingBatchRetryDelayMs = (failedAttempt: number) =>
  Math.min(1000 * (2 ** Math.max(0, failedAttempt - 1)), 4000)

const waitForBillingBatchRetry = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

export const runBillingBatchWithRetry = async <T>(
  operation: (attempt: number) => Promise<T>,
  options: BillingBatchRetryOptions = {},
) => {
  const maxAttempts = options.maxAttempts ?? BILLING_BATCH_MAX_ATTEMPTS

  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new RangeError('Billing batch retry attempts must be a positive integer.')
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableBillingBatchError(error)) {
        throw error
      }

      const delayMs = getBillingBatchRetryDelayMs(attempt)
      await options.onRetry?.({
        failedAttempt: attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
        delayMs,
        error,
      })
      await (options.wait ?? waitForBillingBatchRetry)(delayMs)
    }
  }

  throw new Error('Billing batch retry loop ended unexpectedly.')
}

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
  if (input.chargeType === 'GENERAL') {
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
    input.chargeType === 'DG_SET'
      ? DG_DUE_GENERATION_BATCH_SIZE
      : CAM_DUE_GENERATION_BATCH_SIZE,
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
