import { canUserAccessRoute } from '~/shared/auth'

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
      return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
    }

    if (!canUserAccessRoute(to.path, me.user)) {
      return navigateTo('/forbidden')
    }
  }
})
