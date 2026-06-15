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
  minLength: 12,
  requiresUppercase: true,
  requiresLowercase: true,
  requiresNumber: true,
  requiresSymbol: true,
}

const SAFE_REDIRECT_PREFIXES = ['/admin', '/my', '/service', '/guard', '/change-password', '/verify-email']

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

export const isProtectedRoute = (path: string) =>
  path.startsWith('/admin') ||
  path.startsWith('/my') ||
  path.startsWith('/service') ||
  path.startsWith('/guard') ||
  path === '/change-password'

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
