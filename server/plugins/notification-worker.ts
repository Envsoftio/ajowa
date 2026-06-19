import { getDatabasePool } from '../utils/database'
import { dispatchNotificationJobs } from '../utils/notifications'

type NotificationWorkerState = {
  timer: ReturnType<typeof setInterval> | null
  processing: boolean
}

const globalStateKey = '__ajowaNotificationWorker'

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export default defineNitroPlugin((nitroApp) => {
  if (process.env.NOTIFICATION_WORKER_ENABLED === 'false') {
    return
  }

  const root = globalThis as typeof globalThis & {
    [globalStateKey]?: NotificationWorkerState
  }
  const state = root[globalStateKey] ?? { timer: null, processing: false }
  root[globalStateKey] = state

  if (state.timer) {
    return
  }

  const intervalMs = parsePositiveInteger(process.env.NOTIFICATION_WORKER_INTERVAL_MS, 30_000)
  const batchSize = parsePositiveInteger(process.env.NOTIFICATION_WORKER_BATCH_SIZE, 50)

  const processQueue = async () => {
    if (state.processing) {
      return
    }

    state.processing = true
    const client = await getDatabasePool().connect()

    try {
      const result = await dispatchNotificationJobs(client, { limit: batchSize })
      if (result.claimed > 0) {
        console.info(JSON.stringify({ level: 'info', message: 'Notification queue processed.', ...result }))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Notification queue processing failed.'
      console.error(JSON.stringify({ level: 'error', message }))
    } finally {
      client.release()
      state.processing = false
    }
  }

  state.timer = setInterval(() => {
    void processQueue()
  }, intervalMs)
  state.timer.unref?.()

  const initialTimer = setTimeout(() => {
    void processQueue()
  }, 5_000)
  initialTimer.unref?.()

  nitroApp.hooks.hookOnce('close', () => {
    if (state.timer) {
      clearInterval(state.timer)
      state.timer = null
    }
    clearTimeout(initialTimer)
  })
})
