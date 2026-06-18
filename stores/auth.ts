import { defineStore } from 'pinia'
import type { AuthMe } from '~/types/auth'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    me: null as AuthMe | null,
    loading: false,
    loaded: false,
  }),
  getters: {
    isAuthenticated: (state) => state.me != null,
  },
  actions: {
    async fetchMe(force = false) {
      if (this.loading) {
        return this.me
      }

      if (this.loaded && !force) {
        return this.me
      }

      this.loading = true

      try {
        const requestHeaders = useRequestHeaders(['cookie'])
        const response = await $fetch<{ ok: true; data: AuthMe | null }>('/api/auth/me', {
          credentials: 'include',
          headers: requestHeaders as HeadersInit,
        })
        this.me = response.data
        this.loaded = true
        return this.me
      } catch {
        this.me = null
        this.loaded = true
        return null
      } finally {
        this.loading = false
      }
    },
    async login(payload: { email: string; password: string; rememberMe?: boolean }) {
      await $fetch('/api/auth/sign-in/email', {
        method: 'POST',
        credentials: 'include',
        body: {
          ...payload,
          callbackURL: '/',
        },
      })

      return this.fetchMe(true)
    },
    async logout() {
      try {
        await $fetch('/api/auth/sign-out', {
          method: 'POST',
          credentials: 'include',
          body: {},
        })
      } finally {
        this.me = null
        this.loaded = true
      }
    },
    reset() {
      this.me = null
      this.loaded = false
      this.loading = false
    },
  },
})
