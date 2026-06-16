import { requirePermission } from '~/server/utils/auth'
import type { StaffPermission } from '~/shared/permissions'

export default defineEventHandler(async (event) => {
  const path = getRequestPath(event)

  if (!path.startsWith('/api/admin')) {
    return
  }

  const permission = getAdminApiPermission(path, event.method)

  if (permission) {
    await requirePermission(event, permission)
  }
})

const getAdminApiPermission = (path: string, method: string): StaffPermission | null => {
  if (path.startsWith('/api/admin/staff') || path.startsWith('/api/admin/auth/invites')) {
    return 'staff.manage'
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
  if (path.startsWith('/api/admin/billing/periods') || path.startsWith('/api/admin/billing/charges')) {
    return 'billing.manage'
  }
  if (path.startsWith('/api/admin/billing/defaulters')) {
    return 'defaulters.view'
  }
  if (path.startsWith('/api/admin/finance')) {
    return method === 'GET' ? 'finance.view' : 'finance.manage'
  }
  if (path.startsWith('/api/admin/billing/dues/preview') || method === 'GET') {
    return 'billing.view'
  }
  if (path.startsWith('/api/admin/billing/dues')) {
    return 'dues.manage'
  }
  return null
}
