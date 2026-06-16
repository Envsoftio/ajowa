export type AppShellType = 'public' | 'resident' | 'admin-manager' | 'service-staff' | 'guard'

export type AppNavItem = {
  label: string
  to: string
  icon: string
  badge?: string
}

export const shellLabels: Record<AppShellType, string> = {
  public: 'Public',
  resident: 'Resident',
  'admin-manager': 'Admin and Manager',
  'service-staff': 'Service Staff',
  guard: 'Guard',
}

export const shellTitles: Record<AppShellType, string> = {
  public: 'Home',
  resident: 'Resident Portal',
  'admin-manager': 'Admin Workspace',
  'service-staff': 'Service Console',
  guard: 'Gate Desk',
}

export const shellNavigation: Record<AppShellType, AppNavItem[]> = {
  public: [
    { label: 'Overview', to: '/', icon: 'pi pi-home' },
    { label: 'Login', to: '/login', icon: 'pi pi-sign-in' },
    { label: 'Setup', to: '/setup', icon: 'pi pi-wrench' },
  ],
  resident: [
    { label: 'Dues', to: '/my/dues', icon: 'pi pi-wallet' },
    { label: 'Verify Email', to: '/verify-email', icon: 'pi pi-envelope' },
    { label: 'Password Change', to: '/change-password', icon: 'pi pi-key' },
  ],
  'admin-manager': [
    { label: 'Dashboard', to: '/admin/dashboard', icon: 'pi pi-home' },
    { label: 'Society', to: '/admin/society', icon: 'pi pi-building' },
    { label: 'Blocks', to: '/admin/blocks', icon: 'pi pi-th-large' },
    { label: 'Flats', to: '/admin/flats', icon: 'pi pi-home' },
    { label: 'Residents', to: '/admin/residents', icon: 'pi pi-users' },
    { label: 'Billing Periods', to: '/admin/billing/periods', icon: 'pi pi-calendar' },
    { label: 'Dues', to: '/admin/billing/dues', icon: 'pi pi-wallet' },
    { label: 'Defaulters', to: '/admin/billing/defaulters', icon: 'pi pi-exclamation-triangle' },
    { label: 'Setup', to: '/setup', icon: 'pi pi-wrench' },
    { label: 'Password Change', to: '/change-password', icon: 'pi pi-key' },
  ],
  'service-staff': [
    { label: 'Dashboard', to: '/service/dashboard', icon: 'pi pi-list-check' },
    { label: 'Password Change', to: '/change-password', icon: 'pi pi-key' },
  ],
  guard: [
    { label: 'Scan Desk', to: '/guard/scan', icon: 'pi pi-qrcode' },
    { label: 'Password Change', to: '/change-password', icon: 'pi pi-key' },
  ],
}
