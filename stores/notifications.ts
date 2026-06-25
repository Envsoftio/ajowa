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

export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    unreadCount: 0,
    latest: [] as NotificationSummaryItem[],
    loaded: false,
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
    async refresh(options: { notifyNew?: boolean } = {}) {
      const previousNewestId = this.lastSeenNewestId
      const response = await $fetch<ApiSuccessResponse<NotificationSummary>>(
        '/api/my/notifications/summary',
        { credentials: 'include' },
      )
      const newest = response.data.latest[0] ?? null
      const isNew = Boolean(
        options.notifyNew &&
          previousNewestId &&
          newest &&
          newest.id !== previousNewestId,
      )

      this.unreadCount = response.data.unreadCount
      this.latest = response.data.latest
      this.loaded = true

      if (newest) {
        this.lastSeenNewestId = newest.id
      }

      return { isNew, newest }
    },
    reset() {
      this.unreadCount = 0
      this.latest = []
      this.loaded = false
      this.lastSeenNewestId = null
    },
  },
})
