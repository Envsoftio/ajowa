export const amenityBookingStatuses = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
] as const

export type AmenityBookingStatus = (typeof amenityBookingStatuses)[number]

export const amenityBookingStatusLabels: Record<AmenityBookingStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
  NO_SHOW: 'No show',
}

export const activeAmenityBookingStatuses: AmenityBookingStatus[] = [
  'REQUESTED',
  'APPROVED',
]

export const blockingAmenityBookingStatuses: AmenityBookingStatus[] = [
  'APPROVED',
]

export const amenityBookingStatusSeverity = (status: AmenityBookingStatus) => {
  if (status === 'APPROVED' || status === 'COMPLETED') return 'success'
  if (status === 'REQUESTED') return 'info'
  if (status === 'REJECTED' || status === 'CANCELLED' || status === 'NO_SHOW') return 'danger'
  return 'secondary'
}
