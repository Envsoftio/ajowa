import type { ApiErrorPayload } from '~/types/api'

export const useApi = () => {
  const toast = useToast()

  return async function apiFetch<T>(url: string, options?: Parameters<typeof $fetch<T>>[1]) {
    try {
      return await $fetch<T>(url, {
        credentials: 'include',
        ...options,
      })
    } catch (error) {
      const fetchError = error as {
        data?: ApiErrorPayload
        statusCode?: number
      }

      if (fetchError.statusCode === 401) {
        const authStore = useAuthStore()
        authStore.reset()
        await navigateTo('/login?reason=session-expired')
        return Promise.reject(error)
      }

      toast.add({
        severity: 'error',
        summary: 'Request failed',
        detail: fetchError.data?.message ?? 'Something went wrong. Please try again.',
        life: 5000,
      })

      return Promise.reject(error)
    }
  }
}
