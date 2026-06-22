import type { ApiErrorPayload } from '~/types/api'

type FetchErrorPayload = ApiErrorPayload & {
  data?: ApiErrorPayload
}

const formatFirstFieldError = (payload?: ApiErrorPayload) => {
  const fieldErrors =
    payload?.fieldErrors ??
    (payload?.details?.fieldErrors as Record<string, string[]> | undefined)
  const firstFieldError = Object.entries(fieldErrors ?? {})[0]

  if (!firstFieldError) {
    return null
  }

  const [field, messages] = firstFieldError
  const message = messages[0]

  return message ? `${field}: ${message}` : null
}

export const useApi = () => {
  const toast = useToast()
  const requestHeaders = useRequestHeaders(['cookie'])

  return async function apiFetch<T>(url: string, options?: Parameters<typeof $fetch<T>>[1]) {
    try {
      return await $fetch<T>(url, {
        credentials: 'include',
        headers: {
          ...requestHeaders,
          ...options?.headers,
        } as HeadersInit,
        ...options,
      })
    } catch (error) {
      const fetchError = error as {
        data?: FetchErrorPayload
        statusCode?: number
      }
      const errorPayload = fetchError.data?.data ?? fetchError.data
      const detail =
        formatFirstFieldError(errorPayload) ??
        errorPayload?.message ??
        'Something went wrong. Please try again.'

      if (fetchError.statusCode === 401) {
        const authStore = useAuthStore()
        authStore.reset()
        await navigateTo('/login?reason=session-expired')
        return Promise.reject(error)
      }

      toast.add({
        severity: 'error',
        summary: 'Request failed',
        detail,
        life: 10000,
      })

      return Promise.reject(error)
    }
  }
}
