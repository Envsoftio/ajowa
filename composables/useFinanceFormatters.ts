export const useFinanceFormatters = () => {
  const formatMoney = (value: number | null | undefined) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(Number(value ?? 0))

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '-'

    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value))
  }

  const formatDateTime = (value: string | null | undefined) => {
    if (!value) return '-'

    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  }

  const formatBytes = (value: number | null | undefined) => {
    const bytes = Number(value ?? 0)
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return {
    formatMoney,
    formatDate,
    formatDateTime,
    formatBytes,
  }
}
