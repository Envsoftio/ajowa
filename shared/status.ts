export type AppStatusTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'accent'

export type AppStatusConfig = {
  label: string
  severity: 'secondary' | 'info' | 'success' | 'warn' | 'danger' | 'contrast'
  tone: AppStatusTone
}

export const appStatusMap: Record<string, AppStatusConfig> = {
  active: { label: 'Active', severity: 'success', tone: 'success' },
  paid: { label: 'Paid', severity: 'success', tone: 'success' },
  open: { label: 'Open', severity: 'info', tone: 'info' },
  in_progress: { label: 'In Progress', severity: 'info', tone: 'info' },
  due: { label: 'Due', severity: 'warn', tone: 'warning' },
  pending: { label: 'Pending', severity: 'warn', tone: 'warning' },
  blocked: { label: 'Blocked', severity: 'danger', tone: 'danger' },
  overdue: { label: 'Overdue', severity: 'danger', tone: 'danger' },
  inactive: { label: 'Inactive', severity: 'secondary', tone: 'neutral' },
  draft: { label: 'Draft', severity: 'contrast', tone: 'accent' },
  locked: { label: 'Locked', severity: 'contrast', tone: 'accent' },
  partially_paid: { label: 'Partially Paid', severity: 'warn', tone: 'warning' },
  waived: { label: 'Waived', severity: 'secondary', tone: 'neutral' },
  cancelled: { label: 'Cancelled', severity: 'secondary', tone: 'neutral' },
}

export const getStatusConfig = (status: string) => {
  const normalized = status.trim().toLowerCase().replace(/\s+/g, '_')

  return (
    appStatusMap[normalized] ?? {
      label: status,
      severity: 'secondary',
      tone: 'neutral',
    }
  )
}
