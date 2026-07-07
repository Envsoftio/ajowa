export const staffPermissions = [
  'society.manage',
  'blocks.manage',
  'flats.manage',
  'residents.manage',
  'billing.view',
  'billing.manage',
  'dues.manage',
  'defaulters.view',
  'finance.view',
  'finance.manage',
  'staff.manage',
  'service-requests.manage',
  'amenity-bookings.manage',
  'amenities.manage',
  'notifications.view',
  'notifications.manage',
] as const

export type StaffPermission = (typeof staffPermissions)[number]

export const staffPermissionLabels: Record<StaffPermission, string> = {
  'society.manage': 'Society settings',
  'blocks.manage': 'Blocks',
  'flats.manage': 'Flats',
  'residents.manage': 'Residents and gate logs',
  'billing.view': 'Billing view',
  'billing.manage': 'Billing setup',
  'dues.manage': 'Dues and waivers',
  'defaulters.view': 'Defaulters',
  'finance.view': 'Finance view',
  'finance.manage': 'Finance accounts',
  'staff.manage': 'Staff and departments',
  'service-requests.manage': 'Service requests',
  'amenity-bookings.manage': 'Amenity bookings',
  'amenities.manage': 'Amenities',
  'notifications.view': 'Notification history',
  'notifications.manage': 'Notification settings and broadcasts',
}

export const adminPermissions: StaffPermission[] = [...staffPermissions]

export const managerDefaultPermissions: StaffPermission[] = [
  'society.manage',
  'blocks.manage',
  'flats.manage',
  'residents.manage',
  'billing.view',
  'billing.manage',
  'dues.manage',
  'defaulters.view',
  'finance.view',
  'finance.manage',
  'service-requests.manage',
  'amenity-bookings.manage',
  'amenities.manage',
  'notifications.view',
  'notifications.manage',
]

export type StaffManagedRole = 'MANAGER' | 'SERVICE_STAFF' | 'GUARD'

export const staffRoleAccessDescriptions: Record<StaffManagedRole, {
  title: string
  description: string
  permissionsEditable: boolean
  accessLabel: string
}> = {
  MANAGER: {
    title: 'Manager workspace',
    description: 'Managers use selected admin permissions for society, billing, finance, residents, service requests, staff, and notifications.',
    permissionsEditable: true,
    accessLabel: 'Configurable admin access',
  },
  SERVICE_STAFF: {
    title: 'Service console',
    description: 'Service staff access assigned departments and tickets only. Department assignments decide what work appears.',
    permissionsEditable: false,
    accessLabel: 'Assigned tickets only',
  },
  GUARD: {
    title: 'Gate desk',
    description: 'Guards can scan and verify QR codes, seeing only the resident name and permitted flat labels returned by the scan.',
    permissionsEditable: false,
    accessLabel: 'QR scan only',
  },
}

export const normalizeRolePermissions = (
  role: StaffManagedRole | 'ADMIN' | 'RESIDENT',
  permissions: readonly string[] | null | undefined,
): StaffPermission[] => {
  if (role === 'ADMIN') {
    return adminPermissions
  }

  if (role === 'MANAGER') {
    const requested = permissions?.length ? permissions : managerDefaultPermissions
    return requested.filter((permission): permission is StaffPermission =>
      staffPermissions.includes(permission as StaffPermission),
    )
  }

  return []
}
