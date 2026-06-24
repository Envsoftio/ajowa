import type { ApiErrorPayload } from '~/types/api'

type FetchErrorPayload = ApiErrorPayload & {
  data?: ApiErrorPayload
}

type ApiFetchOptions<T> = NonNullable<Parameters<typeof $fetch<T>>[1]> & {
  showErrorToast?: boolean
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

  return async function apiFetch<T>(url: string, options?: ApiFetchOptions<T>) {
    const { showErrorToast = true, ...fetchOptions } = (options ?? {}) as ApiFetchOptions<T>

    try {
      return await $fetch<T>(url, {
        credentials: 'include',
        headers: {
          ...requestHeaders,
          ...fetchOptions.headers,
        } as HeadersInit,
        ...fetchOptions,
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

      if (showErrorToast) {
        toast.add({
          severity: 'error',
          summary: 'Request failed',
          detail,
          life: 10000,
        })
      }

      return Promise.reject(error)
    }
  }
}
