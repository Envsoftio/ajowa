import type { ApiErrorPayload } from '~/types/api'

type FetchErrorPayload = ApiErrorPayload & {
  data?: ApiErrorPayload
}

type ApiFetchOptions<T> = NonNullable<Parameters<typeof $fetch<T>>[1]> & {
  showErrorToast?: boolean
}

const humanizeFieldName = (field: string) =>
  field
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase())

const formatFirstFieldError = (payload?: Partial<ApiErrorPayload>) => {
  const fieldErrors =
    payload?.fieldErrors ??
    (payload?.details?.fieldErrors as Record<string, string[]> | undefined)
  const firstFieldError = Object.entries(fieldErrors ?? {})[0]

  if (!firstFieldError) {
    return null
  }

  const [field, messages] = firstFieldError
  const message = messages[0]

  if (!message) {
    return null
  }

  const fieldName = humanizeFieldName(field)

  return message.toLowerCase().includes(fieldName.toLowerCase())
    ? message
    : `${fieldName}: ${message}`
}

export const getApiErrorMessage = (
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
) => {
  const fetchError = error as {
    data?: FetchErrorPayload
  }
  const errorPayload = fetchError.data?.data ?? fetchError.data

  return (
    formatFirstFieldError(errorPayload) ??
    errorPayload?.message ??
    fetchError.data?.message ??
    fallback
  )
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
      const detail = getApiErrorMessage(error)

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
