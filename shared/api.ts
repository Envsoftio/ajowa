import { z } from 'zod'
import type { ListQueryParams, PaginatedResult, PaginationParams, SortDirection } from '~/types/api'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 2000

const positiveInt = z.coerce.number().int().positive()

export const paginationQuerySchema = z.object({
  page: positiveInt.default(1),
  pageSize: positiveInt.max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})

export const listQuerySchema = z
  .object({
    page: positiveInt.default(1),
    pageSize: positiveInt.max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    search: z
      .string()
      .trim()
      .transform((val) => (val === '' ? undefined : val))
      .optional(),
    sortBy: z.string().trim().min(1).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
  })
  .passthrough()

export const normalizePaginationParams = (input: Partial<PaginationParams>): PaginationParams => {
  const page = Number(input.page ?? 1)
  const pageSize = Number(input.pageSize ?? DEFAULT_PAGE_SIZE)

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize:
      Number.isInteger(pageSize) && pageSize > 0 && pageSize <= MAX_PAGE_SIZE
        ? pageSize
        : DEFAULT_PAGE_SIZE,
  }
}

export const normalizeSortDirection = (input?: string | null): SortDirection | undefined => {
  if (input === 'asc' || input === 'desc') {
    return input
  }

  return undefined
}

export const normalizeFilters = (
  query: Record<string, unknown>,
  reservedKeys: string[] = ['page', 'pageSize', 'search', 'sortBy', 'sortDirection'],
) => {
  return Object.entries(query).reduce<Record<string, string[]>>((filters, [key, value]) => {
    if (reservedKeys.includes(key) || value == null) {
      return filters
    }

    const normalized = Array.isArray(value) ? value : [value]
    const items = normalized
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0)

    if (items.length > 0) {
      filters[key] = items
    }

    return filters
  }, {})
}

export const normalizeListQuery = (query: Record<string, unknown>): ListQueryParams => {
  const parsed = listQuerySchema.parse(query)
  const pagination = normalizePaginationParams(parsed)
  const normalized: ListQueryParams = {
    ...pagination,
    filters: normalizeFilters(query),
  }

  if (parsed.search) {
    normalized.search = parsed.search
  }

  if (parsed.sortBy) {
    normalized.sortBy = parsed.sortBy
  }

  if (parsed.sortDirection) {
    normalized.sortDirection = parsed.sortDirection
  }

  return normalized
}

export const createPaginatedResult = <T>(
  items: T[],
  total: number,
  params: PaginationParams,
): PaginatedResult<T> => ({
  items,
  total,
  page: params.page,
  pageSize: params.pageSize,
})
