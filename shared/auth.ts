import type { AppRole } from '~/types/auth'

export const PUBLIC_AUTH_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/accept-invite',
  '/forbidden',
] as const

export const PASSWORD_POLICY = {
  minLength: 8,
  requiresUppercase: true,
  requiresLowercase: true,
  requiresNumber: true,
  requiresSymbol: true,
}

const SAFE_REDIRECT_PREFIXES = ['/admin', '/my', '/service', '/guard', '/change-password', '/verify-email']
const TEMPORARY_PASSWORD_CHANGE_EXEMPT_ROLES: readonly AppRole[] = ['GUARD']
export const QR_SCAN_ROLES: readonly AppRole[] = ['ADMIN', 'MANAGER', 'SERVICE_STAFF', 'GUARD']
export const canRoleScanQr = (role: AppRole) => QR_SCAN_ROLES.includes(role)

type RouteAccessUser = {
  role: AppRole
  permissions: readonly string[]
}

export const getRoleLandingRoute = (role: AppRole) => {
  switch (role) {
    case 'ADMIN':
    case 'MANAGER':
      return '/admin/dashboard'
    case 'SERVICE_STAFF':
      return '/service/dashboard'
    case 'GUARD':
      return '/guard/scan'
    case 'RESIDENT':
    default:
      return '/my/dues'
  }
}

export const requiresTemporaryPasswordChangeForRole = (role: AppRole) =>
  !TEMPORARY_PASSWORD_CHANGE_EXEMPT_ROLES.includes(role)

export const isProtectedRoute = (path: string) =>
  path.startsWith('/admin') ||
  path.startsWith('/my') ||
  path.startsWith('/service') ||
  path.startsWith('/guard') ||
  path === '/change-password'

const getPathname = (value: string) => value.split(/[?#]/)[0] || '/'

export const getAdminRoutePermission = (path: string) => {
  const pathname = getPathname(path)

  if (pathname.startsWith('/admin/staff') || pathname.startsWith('/admin/auth/invites')) {
    return 'staff.manage'
  }
  if (pathname.startsWith('/admin/society')) {
    return 'society.manage'
  }
  if (pathname.startsWith('/admin/blocks')) {
    return 'blocks.manage'
  }
  if (pathname.startsWith('/admin/flats')) {
    return 'flats.manage'
  }
  if (pathname.startsWith('/admin/residents')) {
    return 'residents.manage'
  }
  if (pathname.startsWith('/admin/gate-log')) {
    return 'residents.manage'
  }
  if (pathname.startsWith('/admin/service-departments')) {
    return 'staff.manage'
  }
  if (pathname.startsWith('/admin/service-requests')) {
    return 'service-requests.manage'
  }
  if (pathname.startsWith('/admin/amenity-bookings')) {
    return 'amenity-bookings.manage'
  }
  if (pathname.startsWith('/admin/amenities')) {
    return 'amenities.manage'
  }
  if (pathname.startsWith('/admin/settings/notifications')) {
    return 'notifications.manage'
  }
  if (
    pathname.startsWith('/admin/notifications/compose') ||
    pathname.startsWith('/admin/notifications/templates')
  ) {
    return 'notifications.manage'
  }
  if (
    pathname.startsWith('/admin/notifications') ||
    pathname.startsWith('/admin/notification') ||
    pathname.startsWith('/admin/notices')
  ) {
    return 'notifications.view'
  }
  if (
    pathname.startsWith('/admin/billing/periods') ||
    pathname.startsWith('/admin/billing/charges') ||
    pathname.startsWith('/admin/billing/cam-advance') ||
    pathname.startsWith('/admin/billing/cam') ||
    pathname.startsWith('/admin/billing/dg-set')
  ) {
    return 'billing.manage'
  }
  if (pathname.startsWith('/admin/billing/dues')) {
    return 'billing.view'
  }
  if (pathname.startsWith('/admin/billing/defaulters')) {
    return 'defaulters.view'
  }
  if (pathname.startsWith('/admin/payments')) {
    return 'billing.manage'
  }
  if (
    pathname.startsWith('/admin/finance/transactions/new') ||
    pathname.startsWith('/admin/finance/accounts') ||
    pathname.startsWith('/admin/finance/bank-accounts') ||
    pathname.startsWith('/admin/finance/categories') ||
    pathname.startsWith('/admin/finance/period-close') ||
    pathname.startsWith('/admin/finance/reconciliation')
  ) {
    return 'finance.manage'
  }
  if (pathname.startsWith('/admin/finance')) {
    return 'finance.view'
  }

  return null
}

export const canUserAccessRoute = (path: string, user: RouteAccessUser) => {
  const pathname = getPathname(path)

  if (pathname === '/change-password' || pathname === '/verify-email' || pathname === '/forbidden') {
    return true
  }

  if (pathname === '/guard/scan') {
    return canRoleScanQr(user.role)
  }

  if (pathname.startsWith('/guard')) {
    return user.role === 'GUARD' && pathname === '/guard/notifications'
  }

  if (pathname.startsWith('/service')) {
    return user.role === 'SERVICE_STAFF'
  }

  if (pathname.startsWith('/my')) {
    return user.role === 'RESIDENT'
  }

  if (pathname.startsWith('/admin')) {
    if (!['ADMIN', 'MANAGER'].includes(user.role)) {
      return false
    }

    const requiredPermission = getAdminRoutePermission(pathname)
    return !requiredPermission || user.permissions.includes(requiredPermission)
  }

  return true
}

export const isGuestOnlyRoute = (path: string) => PUBLIC_AUTH_ROUTES.includes(path as (typeof PUBLIC_AUTH_ROUTES)[number])

export const isSafeRedirectPath = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    return false
  }

  return SAFE_REDIRECT_PREFIXES.some((prefix) => value === prefix || value.startsWith(`${prefix}/`))
}

export const validatePasswordPolicy = (password: string) => {
  return {
    minLength: password.length >= PASSWORD_POLICY.minLength,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  }
}

export const passwordPolicySatisfied = (password: string) => {
  const result = validatePasswordPolicy(password)
  return Object.values(result).every(Boolean)
}

export const getPasswordPolicyMessage = (password: string) => {
  const result = validatePasswordPolicy(password)
  const missing: string[] = []

  if (!result.minLength) {
    missing.push(`at least ${PASSWORD_POLICY.minLength} characters`)
  }
  if (!result.uppercase) {
    missing.push('one uppercase letter')
  }
  if (!result.lowercase) {
    missing.push('one lowercase letter')
  }
  if (!result.number) {
    missing.push('one number')
  }
  if (!result.symbol) {
    missing.push('one symbol')
  }

  return missing.length > 0 ? `Use ${missing.join(', ')}.` : null
}
