const SAME_ORIGIN_BASE = 'https://ajowa.local'

export const isInternalDocumentUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.startsWith('/api/') || value.startsWith('//')) {
    return false
  }

  try {
    const url = new URL(value, SAME_ORIGIN_BASE)

    return url.origin === SAME_ORIGIN_BASE && url.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

export const isSafeDocumentReturnPath = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return false
  }

  return !value.startsWith('/api/')
}

export const withDownloadQuery = (value: string) => {
  const url = new URL(value, SAME_ORIGIN_BASE)

  url.searchParams.set('download', '1')

  return `${url.pathname}${url.search}${url.hash}`
}
