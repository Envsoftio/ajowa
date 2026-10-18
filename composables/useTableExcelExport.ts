type TableExportResponse<T> = {
  data: { items: T[]; total: number }
}

export type TableExportColumn = { field: string; header: string }

export const fetchAllTableRows = async <T>(
  fetchPage: (query: Record<string, unknown>) => Promise<TableExportResponse<T>>,
  query: Record<string, unknown> = {},
): Promise<T[]> => {
  const pageSize = 100
  const rows: T[] = []
  let page = 1
  let total = Infinity

  while (rows.length < total) {
    const response = await fetchPage({ ...query, page, pageSize })
    const batch = response.data.items
    total = response.data.total
    rows.push(...batch)
    if (batch.length === 0) break
    page += 1
  }

  return rows
}

export const downloadTableExcel = async (
  rows: Record<string, unknown>[],
  columns: TableExportColumn[],
  filename: string,
) => {
  const XLSX = await import('xlsx')
  const clean = (value: unknown): string | number | boolean => {
    if (value == null) return ''
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
    if (value instanceof Date) return value.toISOString()
    return JSON.stringify(value)
  }
  const sheet = XLSX.utils.aoa_to_sheet([
    columns.map((column) => column.header),
    ...rows.map((row) => columns.map((column) => clean(column.field.split('.').reduce<unknown>((value, key) =>
      value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, row)),
    )),
  ])
  sheet['!cols'] = columns.map((column) => ({ wch: Math.min(42, Math.max(14, column.header.length + 4)) }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Table')
  XLSX.writeFile(workbook, `${filename.replace(/[^a-z0-9_-]+/gi, '-')}.xlsx`)
}
