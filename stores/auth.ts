import { defineStore } from 'pinia'
import type { AuthMe } from '~/types/auth'

const fetchMeRequests = new WeakMap<object, Promise<AuthMe | null>>()

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
      const existingRequest = fetchMeRequests.get(this)

      if (this.loaded && !force) {
        return this.me
      }

      if (existingRequest && !force) {
        return existingRequest
      }

      this.loading = true

      let request!: Promise<AuthMe | null>
      request = (async () => {
        try {
          const requestHeaders = useRequestHeaders(['cookie'])
          const response = await $fetch<{ ok: true; data: AuthMe | null }>('/api/auth/me', {
            credentials: 'include',
            headers: requestHeaders as HeadersInit,
          })
          if (fetchMeRequests.get(this) !== request) {
            return this.me
          }
          this.me = response.data
          this.loaded = true
          return this.me
        } catch {
          if (fetchMeRequests.get(this) !== request) {
            return this.me
          }
          this.me = null
          this.loaded = true
          return null
        }
      })()

      fetchMeRequests.set(this, request)
      const clearRequest = () => {
        if (fetchMeRequests.get(this) === request) {
          fetchMeRequests.delete(this)
          this.loading = false
        }
      }
      request.then(clearRequest, clearRequest)

      return request
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
        fetchMeRequests.delete(this)
        this.me = null
        this.loaded = true
        this.loading = false
      }
    },
    reset() {
      fetchMeRequests.delete(this)
      this.me = null
      this.loaded = false
      this.loading = false
    },
  },
})
