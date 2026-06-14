export type ApiErrorPayload = {
  code: string
  message: string
  requestId?: string
  details?: Record<string, unknown>
  fieldErrors?: Record<string, string[]>
}

export type ApiMeta = {
  requestId: string
  timestamp: string
}

export type ApiSuccessResponse<T> = {
  ok: true
  data: T
  meta: ApiMeta
}

export type PaginatedResult<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type PaginatedResponse<T> = ApiSuccessResponse<PaginatedResult<T>>

export type PaginationParams = {
  page: number
  pageSize: number
}

export type SortDirection = 'asc' | 'desc'

export type ListQueryParams = PaginationParams & {
  search?: string
  sortBy?: string
  sortDirection?: SortDirection
  filters: Record<string, string[]>
}
