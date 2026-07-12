export type AppShellType =
  | 'public'
  | 'resident'
  | 'admin-manager'
  | 'service-staff'
  | 'guard'

export type AppNavItem = {
  label: string
  to: string
  icon: string
  badge?: string
}

export type AppNavGroup = {
  label: string
  icon: string
  items: AppNavItem[]
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

export const shellNavigation: Record<AppShellType, AppNavGroup[]> = {
  public: [
    {
      label: 'Start',
      icon: 'pi pi-home',
      items: [
        { label: 'Overview', to: '/', icon: 'pi pi-home' },
        { label: 'Login', to: '/login', icon: 'pi pi-sign-in' },
      ],
    },
    {
      label: 'Legal',
      icon: 'pi pi-file-edit',
      items: [
        { label: 'Policy', to: '/policy', icon: 'pi pi-shield' },
        { label: 'Privacy Policy', to: '/privacy-policy', icon: 'pi pi-lock' },
        { label: 'Refund Policy', to: '/refund-policy', icon: 'pi pi-wallet' },
        {
          label: 'Terms & Conditions',
          to: '/terms-and-conditions',
          icon: 'pi pi-file-edit',
        },
      ],
    },
  ],
  resident: [
    {
      label: 'Billing',
      icon: 'pi pi-wallet',
      items: [
        { label: 'Dues', to: '/my/dues', icon: 'pi pi-wallet' },
        { label: 'Receipts', to: '/my/receipts', icon: 'pi pi-receipt' },
      ],
    },
    {
      label: 'Community',
      icon: 'pi pi-megaphone',
      items: [
        { label: 'Notices', to: '/my/notices', icon: 'pi pi-megaphone' },
        {
          label: 'Profession Directory',
          to: '/my/profession-directory',
          icon: 'pi pi-briefcase',
        },
        { label: 'Notifications', to: '/my/notifications', icon: 'pi pi-bell' },
      ],
    },
    {
      label: 'Access & Support',
      icon: 'pi pi-qrcode',
      items: [
        {
          label: 'My Bookings',
          to: '/my/amenity-bookings',
          icon: 'pi pi-calendar',
        },
        {
          label: 'Service Requests',
          to: '/my/service-requests',
          icon: 'pi pi-ticket',
        },
        { label: 'QR Access', to: '/my/qr', icon: 'pi pi-qrcode' },
      ],
    },
    {
      label: 'Account',
      icon: 'pi pi-user',
      items: [
        {
          label: 'Notification Settings',
          to: '/my/settings/notifications',
          icon: 'pi pi-sliders-h',
        },
        { label: 'Verify Email', to: '/verify-email', icon: 'pi pi-envelope' },
        { label: 'Password Change', to: '/change-password', icon: 'pi pi-key' },
      ],
    },
    {
      label: 'Legal',
      icon: 'pi pi-file-edit',
      items: [
        { label: 'Policy', to: '/policy', icon: 'pi pi-shield' },
        { label: 'Privacy Policy', to: '/privacy-policy', icon: 'pi pi-lock' },
        { label: 'Refund Policy', to: '/refund-policy', icon: 'pi pi-wallet' },
        {
          label: 'Terms & Conditions',
          to: '/terms-and-conditions',
          icon: 'pi pi-file-edit',
        },
      ],
    },
  ],
  'admin-manager': [
    {
      label: 'Overview',
      icon: 'pi pi-home',
      items: [
        { label: 'Dashboard', to: '/admin/dashboard', icon: 'pi pi-home' },
      ],
    },
    {
      label: 'Society',
      icon: 'pi pi-building',
      items: [
        {
          label: 'Society Profile',
          to: '/admin/society',
          icon: 'pi pi-building',
        },
        { label: 'Blocks', to: '/admin/blocks', icon: 'pi pi-th-large' },
        { label: 'Flats', to: '/admin/flats', icon: 'pi pi-home' },
        { label: 'Residents', to: '/admin/residents', icon: 'pi pi-users' },
        {
          label: 'Professions',
          to: '/admin/professions',
          icon: 'pi pi-briefcase',
        },
      ],
    },
    {
      label: 'People & Services',
      icon: 'pi pi-id-card',
      items: [
        { label: 'Staff', to: '/admin/staff', icon: 'pi pi-id-card' },
        {
          label: 'Service Departments',
          to: '/admin/service-departments',
          icon: 'pi pi-sitemap',
        },
        {
          label: 'Service Requests',
          to: '/admin/service-requests',
          icon: 'pi pi-ticket',
        },
        {
          label: 'Amenity Bookings',
          to: '/admin/amenity-bookings',
          icon: 'pi pi-calendar',
        },
        { label: 'Amenities', to: '/admin/amenities', icon: 'pi pi-building' },
      ],
    },
    {
      label: 'Communication',
      icon: 'pi pi-megaphone',
      items: [
        { label: 'Notices', to: '/admin/notices', icon: 'pi pi-megaphone' },
        {
          label: 'My Alerts',
          to: '/admin/my-notifications',
          icon: 'pi pi-inbox',
        },
        {
          label: 'Notifications',
          to: '/admin/notifications',
          icon: 'pi pi-bell',
        },
        {
          label: 'Compose',
          to: '/admin/notifications/compose',
          icon: 'pi pi-send',
        },
        {
          label: 'Templates',
          to: '/admin/notifications/templates',
          icon: 'pi pi-file-edit',
        },
        {
          label: 'Notification Settings',
          to: '/admin/settings/notifications',
          icon: 'pi pi-sliders-h',
        },
      ],
    },
    {
      label: 'Billing & Payments',
      icon: 'pi pi-wallet',
      items: [
        {
          label: 'CAM Charges',
          to: '/admin/billing/cam',
          icon: 'pi pi-percentage',
        },
        {
          label: 'CAM Advance',
          to: '/admin/billing/cam-advance',
          icon: 'pi pi-calendar-clock',
        },
        {
          label: 'DG Set Charges',
          to: '/admin/billing/dg-set',
          icon: 'pi pi-bolt',
        },
        { label: 'Dues', to: '/admin/billing/dues', icon: 'pi pi-wallet' },
        {
          label: 'Defaulters',
          to: '/admin/billing/defaulters',
          icon: 'pi pi-exclamation-triangle',
        },
        { label: 'Payments', to: '/admin/payments', icon: 'pi pi-credit-card' },
      ],
    },
    {
      label: 'Finance',
      icon: 'pi pi-book',
      items: [
        {
          label: 'Accounts',
          to: '/admin/finance/accounts',
          icon: 'pi pi-sitemap',
        },
        {
          label: 'Categories',
          to: '/admin/finance/categories',
          icon: 'pi pi-tags',
        },
        {
          label: 'Transactions',
          to: '/admin/finance/transactions',
          icon: 'pi pi-receipt',
        },
      ],
    },
    {
      label: 'Reports',
      icon: 'pi pi-chart-bar',
      items: [
        {
          label: 'Reports',
          to: '/admin/finance/reports',
          icon: 'pi pi-chart-bar',
        },
        {
          label: 'Report Shares',
          to: '/admin/finance/reports/shares',
          icon: 'pi pi-share-alt',
        },
      ],
    },
    {
      label: 'Access & Settings',
      icon: 'pi pi-cog',
      items: [
        { label: 'Scan QR', to: '/guard/scan', icon: 'pi pi-qrcode' },
        { label: 'Gate Log', to: '/admin/gate-log', icon: 'pi pi-qrcode' },
        { label: 'Audit Log', to: '/admin/audit', icon: 'pi pi-history' },
        { label: 'Password Change', to: '/change-password', icon: 'pi pi-key' },
      ],
    },
    {
      label: 'Legal',
      icon: 'pi pi-file-edit',
      items: [
        { label: 'Policy', to: '/policy', icon: 'pi pi-shield' },
        { label: 'Privacy Policy', to: '/privacy-policy', icon: 'pi pi-lock' },
        { label: 'Refund Policy', to: '/refund-policy', icon: 'pi pi-wallet' },
        {
          label: 'Terms & Conditions',
          to: '/terms-and-conditions',
          icon: 'pi pi-file-edit',
        },
      ],
    },
  ],
  'service-staff': [
    {
      label: 'Work',
      icon: 'pi pi-list-check',
      items: [
        {
          label: 'Dashboard',
          to: '/service/dashboard',
          icon: 'pi pi-list-check',
        },
        { label: 'Tickets', to: '/service/tickets', icon: 'pi pi-ticket' },
        { label: 'Scan QR', to: '/guard/scan', icon: 'pi pi-qrcode' },
      ],
    },
    {
      label: 'Account',
      icon: 'pi pi-user',
      items: [
        {
          label: 'Notifications',
          to: '/service/notifications',
          icon: 'pi pi-bell',
        },
        { label: 'Password Change', to: '/change-password', icon: 'pi pi-key' },
      ],
    },
  ],
  guard: [
    {
      label: 'Gate',
      icon: 'pi pi-qrcode',
      items: [
        { label: 'Scan QR', to: '/guard/scan', icon: 'pi pi-qrcode' },
        {
          label: 'Notifications',
          to: '/guard/notifications',
          icon: 'pi pi-bell',
        },
      ],
    },
  ],
}
