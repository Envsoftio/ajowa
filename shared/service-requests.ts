import type { ServicePriority, ServiceRequestStatus } from '~/types/domain'

export const servicePriorities = ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'] as const

export const serviceRequestStatuses = [
  'OPEN',
  'ASSIGNED',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'ON_HOLD',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
  'NEEDS_REASSIGNMENT',
] as const

export const serviceCategories = [
  { label: 'Plumbing', value: 'PLUMBING' },
  { label: 'Electrical', value: 'ELECTRICAL' },
  { label: 'Cleaning', value: 'CLEANING' },
  { label: 'Housekeeping', value: 'HOUSEKEEPING' },
  { label: 'Security', value: 'SECURITY' },
  { label: 'Lift', value: 'LIFT' },
  { label: 'Civil', value: 'CIVIL' },
  { label: 'Other', value: 'OTHER' },
] as const

export const commonAreaOptions = [
  'Lobby',
  'Basement',
  'Main Gate',
  'Clubhouse',
  'Corridor',
  'Lift Area',
  'Pump Room',
  'Parking',
] as const

export const priorityLabels: Record<ServicePriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  EMERGENCY: 'Emergency',
}

export const statusLabels: Record<ServiceRequestStatus, string> = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'On hold',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
  NEEDS_REASSIGNMENT: 'Needs reassignment',
}

export const activeTicketStatuses: ServiceRequestStatus[] = [
  'OPEN',
  'ASSIGNED',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'ON_HOLD',
  'REOPENED',
  'NEEDS_REASSIGNMENT',
]

export const closedTicketStatuses: ServiceRequestStatus[] = [
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
]

export const getPrioritySeverity = (priority: ServicePriority) => {
  switch (priority) {
    case 'EMERGENCY':
      return 'danger'
    case 'HIGH':
      return 'warn'
    case 'MEDIUM':
      return 'info'
    default:
      return 'secondary'
  }
}

export const getStatusSeverity = (status: ServiceRequestStatus) => {
  switch (status) {
    case 'CLOSED':
    case 'RESOLVED':
      return 'success'
    case 'CANCELLED':
      return 'secondary'
    case 'ON_HOLD':
    case 'NEEDS_REASSIGNMENT':
      return 'warn'
    case 'REOPENED':
    case 'OPEN':
      return 'danger'
    default:
      return 'info'
  }
}

export const formatSlaLabel = (dueByAt?: string | null, isOverdue = false) => {
  if (!dueByAt) {
    return 'No SLA'
  }

  const due = new Date(dueByAt)
  if (Number.isNaN(due.getTime())) {
    return 'No SLA'
  }

  const diffMinutes = Math.round((due.getTime() - Date.now()) / 60000)

  if (isOverdue || diffMinutes < 0) {
    const overdueMinutes = Math.abs(diffMinutes)
    if (overdueMinutes >= 1440) {
      return `${Math.ceil(overdueMinutes / 1440)}d overdue`
    }
    if (overdueMinutes >= 60) {
      return `${Math.ceil(overdueMinutes / 60)}h overdue`
    }
    return `${Math.max(overdueMinutes, 1)}m overdue`
  }

  if (diffMinutes >= 1440) {
    return `Due in ${Math.ceil(diffMinutes / 1440)}d`
  }
  if (diffMinutes >= 60) {
    return `Due in ${Math.ceil(diffMinutes / 60)}h`
  }
  return `Due in ${Math.max(diffMinutes, 1)}m`
}
