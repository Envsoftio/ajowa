export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path.startsWith('/api')) {
    return
  }

  const authStore = useAuthStore()

  if (to.path.startsWith('/guard')) {
    const me = await authStore.fetchMe()

    if (!me) {
      return navigateTo('/login?redirect=/guard/scan')
    }

    if (me.user.role !== 'GUARD' || (to.path !== '/guard/scan' && to.path !== '/verify-email' && to.path !== '/change-password')) {
      return navigateTo('/forbidden')
    }
  }

  if (to.path.startsWith('/service')) {
    const me = await authStore.fetchMe()

    if (!me) {
      return navigateTo('/login?redirect=/service/dashboard')
    }

    if (me.user.role !== 'SERVICE_STAFF') {
      return navigateTo('/forbidden')
    }
  }

  if (to.path.startsWith('/admin')) {
    const me = await authStore.fetchMe()

    if (!me) {
      return navigateTo('/login?redirect=/admin/dashboard')
    }

    if (!['ADMIN', 'MANAGER'].includes(me.user.role)) {
      return navigateTo('/forbidden')
    }
  }

  if (to.path.startsWith('/my')) {
    const me = await authStore.fetchMe()

    if (!me) {
      return navigateTo('/login?redirect=/my/dues')
    }

    if (me.user.role !== 'RESIDENT') {
      return navigateTo('/forbidden')
    }
  }
})
