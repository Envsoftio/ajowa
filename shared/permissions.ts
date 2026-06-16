export const staffPermissions = [
  'society.manage',
  'blocks.manage',
  'flats.manage',
  'residents.manage',
  'billing.view',
  'billing.manage',
  'dues.manage',
  'defaulters.view',
  'staff.manage',
] as const

export type StaffPermission = (typeof staffPermissions)[number]

export const staffPermissionLabels: Record<StaffPermission, string> = {
  'society.manage': 'Society settings',
  'blocks.manage': 'Blocks',
  'flats.manage': 'Flats',
  'residents.manage': 'Residents',
  'billing.view': 'Billing view',
  'billing.manage': 'Billing setup',
  'dues.manage': 'Dues and waivers',
  'defaulters.view': 'Defaulters',
  'staff.manage': 'Staff administration',
}

export const adminPermissions: StaffPermission[] = [...staffPermissions]

export const managerDefaultPermissions: StaffPermission[] = [
  'society.manage',
  'blocks.manage',
  'flats.manage',
  'residents.manage',
  'billing.view',
  'billing.manage',
  'defaulters.view',
]
