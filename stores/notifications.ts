import { defineStore } from 'pinia'
import type { ApiSuccessResponse } from '~/types/api'

export type NotificationSummaryItem = {
  id: string
  title: string
  body: string
  deepLinkUrl: string | null
  priority: string
  isRead: boolean
  createdAt: string
  category: string | null
}

type NotificationSummary = {
  unreadCount: number
  latest: NotificationSummaryItem[]
}

type NotificationRefreshResult = {
  isNew: boolean
  newest: NotificationSummaryItem | null
}

const NOTIFICATION_SUMMARY_MAX_AGE_MS = 30_000
const notificationRefreshRequests = new WeakMap<object, Promise<NotificationRefreshResult>>()

export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    unreadCount: 0,
    latest: [] as NotificationSummaryItem[],
    loaded: false,
    loadedAt: 0,
    lastSeenNewestId: null as string | null,
    soundEnabled: true,
  }),
  actions: {
    hydrateSoundPreference() {
      this.soundEnabled = true
    },
    setSoundEnabled(enabled: boolean) {
      this.soundEnabled = enabled
    },
    async refresh(options: { notifyNew?: boolean; force?: boolean } = {}) {
      const newest = this.latest[0] ?? null
      const loadedRecently =
        this.loaded && Date.now() - this.loadedAt < NOTIFICATION_SUMMARY_MAX_AGE_MS

      if (!options.force && loadedRecently) {
        return { isNew: false, newest }
      }

      const existingRequest = notificationRefreshRequests.get(this)
      if (existingRequest && !options.force) {
        return existingRequest
      }

      const previousNewestId = this.lastSeenNewestId

      let request!: Promise<NotificationRefreshResult>
      // eslint-disable-next-line prefer-const
      request = (async () => {
        const response = await $fetch<ApiSuccessResponse<NotificationSummary>>(
          '/api/my/notifications/summary',
          { credentials: 'include' },
        )
        if (notificationRefreshRequests.get(this) !== request) {
          return { isNew: false, newest: this.latest[0] ?? null }
        }
        const nextNewest = response.data.latest[0] ?? null
        const isNew = Boolean(
          options.notifyNew &&
            previousNewestId &&
            nextNewest &&
            nextNewest.id !== previousNewestId,
        )

        this.unreadCount = response.data.unreadCount
        this.latest = response.data.latest
        this.loaded = true
        this.loadedAt = Date.now()

        if (nextNewest) {
          this.lastSeenNewestId = nextNewest.id
        }

        return { isNew, newest: nextNewest }
      })()

      notificationRefreshRequests.set(this, request)
      const clearRequest = () => {
        if (notificationRefreshRequests.get(this) === request) {
          notificationRefreshRequests.delete(this)
        }
      }
      request.then(clearRequest, clearRequest)

      return request
    },
    reset() {
      notificationRefreshRequests.delete(this)
      this.unreadCount = 0
      this.latest = []
      this.loaded = false
      this.loadedAt = 0
      this.lastSeenNewestId = null
    },
  },
})
