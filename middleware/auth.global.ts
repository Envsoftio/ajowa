import { canUserAccessRoute } from '~/shared/auth'
import type { AppRole } from '~/types/auth'

const isCrossRoleRoute = (path: string, role: AppRole) => {
  if (path.startsWith('/guard')) {
    return role !== 'GUARD'
  }

  if (path.startsWith('/service')) {
    return role !== 'SERVICE_STAFF'
  }

  if (path.startsWith('/my')) {
    return role !== 'RESIDENT'
  }

  if (path.startsWith('/admin')) {
    return !['ADMIN', 'MANAGER'].includes(role)
  }

  return false
}

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path.startsWith('/api')) {
    return
  }

  const authStore = useAuthStore()
  const isRoleScopedRoute =
    to.path.startsWith('/guard') ||
    to.path.startsWith('/service') ||
    to.path.startsWith('/admin') ||
    to.path.startsWith('/my')

  if (isRoleScopedRoute) {
    const me = await authStore.fetchMe()

    if (!me) {
      return navigateTo({ path: '/login', query: { redirect: to.fullPath }, replace: true })
    }

    if (!canUserAccessRoute(to.path, me.user)) {
      if (
        isCrossRoleRoute(to.path, me.user.role) &&
        canUserAccessRoute(me.landingRoute, me.user)
      ) {
        return navigateTo(me.landingRoute, { replace: true })
      }

      return navigateTo('/forbidden', { replace: true })
    }
  }
})
