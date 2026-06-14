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
    { label: 'Setup', to: '/setup', icon: 'pi pi-wrench' },
  ],
  resident: [
    { label: 'Dashboard', to: '/', icon: 'pi pi-home' },
    { label: 'Dues', to: '/setup', icon: 'pi pi-wallet' },
    { label: 'Notices', to: '/setup', icon: 'pi pi-megaphone', badge: '3' },
  ],
  'admin-manager': [
    { label: 'Dashboard', to: '/', icon: 'pi pi-home' },
    { label: 'Residents', to: '/setup', icon: 'pi pi-users' },
    { label: 'Finance', to: '/setup', icon: 'pi pi-building-columns' },
    { label: 'Tickets', to: '/setup', icon: 'pi pi-briefcase', badge: '12' },
  ],
  'service-staff': [
    { label: 'Queue', to: '/', icon: 'pi pi-list-check' },
    { label: 'Assigned', to: '/setup', icon: 'pi pi-bolt' },
  ],
  guard: [
    { label: 'Scan Desk', to: '/', icon: 'pi pi-qrcode' },
    { label: 'Logbook', to: '/setup', icon: 'pi pi-book' },
  ],
}
