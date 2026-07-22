import { requirePermission } from '~/server/utils/auth'
import { logAmenityApiError } from '~/server/utils/amenity-api'
import { toApiError } from '~/server/utils/errors'
import { throwServiceRequestCreateError } from '~/server/utils/service-request-api'
import type { StaffPermission } from '~/shared/permissions'

export default defineEventHandler(async (event) => {
  const path = getRequestPath(event)

  if (!path.startsWith('/api/admin')) {
    return
  }

  const permission = getAdminApiPermission(path, event.method)

  if (permission) {
    try {
      await requirePermission(event, permission)
    } catch (error) {
      if (isAmenityAdminApiPath(path)) {
        logAmenityApiError(event, error, { phase: 'permission' })
        throw toApiError(error)
      }

      if (isServiceRequestCreatePath(path, event.method)) {
        throwServiceRequestCreateError(event, error)
      }

      throw error
    }
  }
})

const isAmenityAdminApiPath = (path: string) =>
  path.startsWith('/api/admin/amenity-bookings') ||
  path.startsWith('/api/admin/amenity-blackouts') ||
  path.startsWith('/api/admin/amenities')

const isServiceRequestCreatePath = (path: string, method: string) =>
  method.toUpperCase() === 'POST' &&
  path.replace(/\/$/, '') === '/api/admin/service-requests'

const getAdminApiPermission = (
  path: string,
  method: string,
): StaffPermission | null => {
  if (
    path.startsWith('/api/admin/staff') ||
    path.startsWith('/api/admin/auth/invites') ||
    path.startsWith('/api/admin/service-departments')
  ) {
    return 'staff.manage'
  }
  if (path.startsWith('/api/admin/service-requests')) {
    return 'service-requests.manage'
  }
  if (path.startsWith('/api/admin/amenity-bookings')) {
    return 'amenity-bookings.manage'
  }
  if (path.startsWith('/api/admin/amenity-blackouts')) {
    return 'amenity-bookings.manage'
  }
  if (path.startsWith('/api/admin/amenities')) {
    return method === 'GET' ? null : 'amenities.manage'
  }
  if (path.startsWith('/api/admin/society')) {
    return 'society.manage'
  }
  if (path.startsWith('/api/admin/blocks')) {
    return 'blocks.manage'
  }
  if (path.startsWith('/api/admin/flats')) {
    return 'flats.manage'
  }
  if (path.startsWith('/api/admin/residents')) {
    return 'residents.manage'
  }
  if (
    path.startsWith('/api/admin/gate-log') ||
    path.startsWith('/api/admin/qr')
  ) {
    return 'residents.manage'
  }
  if (
    path.startsWith('/api/admin/billing/periods') ||
    path.startsWith('/api/admin/billing/charges') ||
    path.startsWith('/api/admin/billing/cam-advance-coverages')
  ) {
    return method === 'GET' ? 'billing.view' : 'billing.manage'
  }
  if (path.startsWith('/api/admin/billing/defaulters')) {
    return 'defaulters.view'
  }
  if (path.startsWith('/api/admin/finance')) {
    return method === 'GET' ? 'finance.view' : 'finance.manage'
  }
  if (path.startsWith('/api/admin/settings/notifications')) {
    return 'notifications.manage'
  }
  if (
    path.startsWith('/api/admin/notifications') ||
    path.startsWith('/api/admin/notices')
  ) {
    return method === 'GET' ? 'notifications.view' : 'notifications.manage'
  }
  if (path.startsWith('/api/admin/billing/dues/preview')) {
    return 'billing.view'
  }
  if (path.startsWith('/api/admin/billing/dues')) {
    return method === 'GET' ? 'billing.view' : 'dues.manage'
  }
  return null
}
