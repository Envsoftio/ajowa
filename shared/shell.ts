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
    { label: 'Notices', to: '/my/notices', icon: 'pi pi-megaphone' },
    { label: 'Notifications', to: '/my/notifications', icon: 'pi pi-bell' },
    { label: 'Service Requests', to: '/my/service-requests', icon: 'pi pi-ticket' },
    { label: 'QR Access', to: '/my/qr', icon: 'pi pi-qrcode' },
    { label: 'Notification Settings', to: '/my/settings/notifications', icon: 'pi pi-sliders-h' },
    { label: 'Verify Email', to: '/verify-email', icon: 'pi pi-envelope' },
    { label: 'Password Change', to: '/change-password', icon: 'pi pi-key' },
  ],
  'admin-manager': [
    { label: 'Dashboard', to: '/admin/dashboard', icon: 'pi pi-home' },
    { label: 'Society', to: '/admin/society', icon: 'pi pi-building' },
    { label: 'Blocks', to: '/admin/blocks', icon: 'pi pi-th-large' },
    { label: 'Flats', to: '/admin/flats', icon: 'pi pi-home' },
    { label: 'Residents', to: '/admin/residents', icon: 'pi pi-users' },
    { label: 'Staff', to: '/admin/staff', icon: 'pi pi-id-card' },
    { label: 'Service Departments', to: '/admin/service-departments', icon: 'pi pi-sitemap' },
    { label: 'Service Requests', to: '/admin/service-requests', icon: 'pi pi-ticket' },
    { label: 'Notices', to: '/admin/notices', icon: 'pi pi-megaphone' },
    { label: 'Notifications', to: '/admin/notifications', icon: 'pi pi-bell' },
    { label: 'Compose', to: '/admin/notifications/compose', icon: 'pi pi-send' },
    { label: 'Templates', to: '/admin/notifications/templates', icon: 'pi pi-file-edit' },
    { label: 'Notification Settings', to: '/admin/settings/notifications', icon: 'pi pi-sliders-h' },
    { label: 'Billing Periods', to: '/admin/billing/periods', icon: 'pi pi-calendar' },
    { label: 'Dues', to: '/admin/billing/dues', icon: 'pi pi-wallet' },
    { label: 'Defaulters', to: '/admin/billing/defaulters', icon: 'pi pi-exclamation-triangle' },
    { label: 'Finance Accounts', to: '/admin/finance/accounts', icon: 'pi pi-sitemap' },
    { label: 'Finance Categories', to: '/admin/finance/categories', icon: 'pi pi-tags' },
    { label: 'Transactions', to: '/admin/finance/transactions', icon: 'pi pi-receipt' },
    { label: 'Finance Journals', to: '/admin/finance/journals', icon: 'pi pi-book' },
    { label: 'Period Close', to: '/admin/finance/period-close', icon: 'pi pi-lock' },
    { label: 'Reconciliation', to: '/admin/finance/reconciliation', icon: 'pi pi-verified' },
    { label: 'Reports', to: '/admin/finance/reports', icon: 'pi pi-chart-bar' },
    { label: 'Setup', to: '/setup', icon: 'pi pi-wrench' },
    { label: 'Password Change', to: '/change-password', icon: 'pi pi-key' },
  ],
  'service-staff': [
    { label: 'Dashboard', to: '/service/dashboard', icon: 'pi pi-list-check' },
    { label: 'Tickets', to: '/service/tickets', icon: 'pi pi-ticket' },
    { label: 'Password Change', to: '/change-password', icon: 'pi pi-key' },
  ],
  guard: [
    { label: 'Scan Desk', to: '/guard/scan', icon: 'pi pi-qrcode' },
    { label: 'Password Change', to: '/change-password', icon: 'pi pi-key' },
  ],
}
