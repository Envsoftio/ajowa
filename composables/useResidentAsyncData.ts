import type { MaybeRefOrGetter, MultiWatchSources } from 'vue'

type ResidentAsyncDataOptions = {
  watch?: MultiWatchSources
}

export const useResidentDataLoading = () =>
  useState<number>('resident-data-loading-count', () => 0)

export const useResidentAsyncData = <DataT>(
  key: MaybeRefOrGetter<string>,
  handler: () => Promise<DataT>,
  options: ResidentAsyncDataOptions = {},
) => {
  const nuxtApp = useNuxtApp()
  const authStore = useAuthStore()
  const loadingCount = useResidentDataLoading()
  const scopedKey = computed(
    () => `resident:${authStore.me?.user.id ?? 'guest'}:${toValue(key)}`,
  )

  const asyncData = useLazyAsyncData<DataT>(
    scopedKey,
    async () => {
      const cachedData =
        nuxtApp.payload.data[scopedKey.value] ??
        nuxtApp.static.data[scopedKey.value]

      if (import.meta.client) {
        loadingCount.value += 1
      }

      try {
        return await handler()
      } catch (error) {
        if (cachedData != null) {
          return cachedData as DataT
        }
        throw error
      } finally {
        if (import.meta.client) {
          loadingCount.value = Math.max(0, loadingCount.value - 1)
        }
      }
    },
    {
      ...(options.watch ? { watch: options.watch } : {}),
      dedupe: 'defer',
      getCachedData: (resolvedKey, app) =>
        app.payload.data[resolvedKey] ?? app.static.data[resolvedKey],
    },
  )

  const pending = computed(
    () => asyncData.pending.value && asyncData.data.value == null,
  )

  onMounted(() => {
    void asyncData.refresh({ cause: 'refresh:manual', dedupe: 'defer' })
  })

  return {
    ...asyncData,
    pending,
    refreshing: asyncData.pending,
  }
}
