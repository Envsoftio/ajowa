import { cleanupFailedUploads } from '../utils/storage'

type StorageCleanupState = {
  timer: ReturnType<typeof setInterval> | null
  processing: boolean
}

const globalStateKey = '__ajowaStorageCleanupWorker'

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export default defineNitroPlugin((nitroApp) => {
  if (process.env.STORAGE_CLEANUP_ENABLED === 'false') {
    return
  }

  const root = globalThis as typeof globalThis & {
    [globalStateKey]?: StorageCleanupState
  }
  const state = root[globalStateKey] ?? { timer: null, processing: false }
  root[globalStateKey] = state

  if (state.timer) {
    return
  }

  const intervalMs = parsePositiveInteger(process.env.STORAGE_CLEANUP_INTERVAL_MS, 6 * 60 * 60 * 1000)
  const olderThanHours = parsePositiveInteger(process.env.STORAGE_CLEANUP_OLDER_THAN_HOURS, 24)

  const processCleanup = async () => {
    if (state.processing) {
      return
    }

    state.processing = true

    try {
      const result = await cleanupFailedUploads(olderThanHours)
      if (result.deletedFileRecords > 0 || result.deletedStorageObjects > 0) {
        console.info(JSON.stringify({ level: 'info', message: 'Storage cleanup processed.', ...result }))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Storage cleanup failed.'
      console.error(JSON.stringify({ level: 'error', message }))
    } finally {
      state.processing = false
    }
  }

  state.timer = setInterval(() => {
    void processCleanup()
  }, intervalMs)
  state.timer.unref?.()

  const initialTimer = setTimeout(() => {
    void processCleanup()
  }, 60_000)
  initialTimer.unref?.()

  nitroApp.hooks.hookOnce('close', () => {
    if (state.timer) {
      clearInterval(state.timer)
      state.timer = null
    }
    clearTimeout(initialTimer)
  })
})
