export const settleSequentially = async <T>(
  tasks: Array<() => Promise<T>>,
): Promise<PromiseSettledResult<T>[]> => {
  const results: PromiseSettledResult<T>[] = []

  for (const task of tasks) {
    try {
      results.push({ status: 'fulfilled', value: await task() })
    } catch (reason) {
      results.push({ status: 'rejected', reason })
    }
  }

  return results
}
