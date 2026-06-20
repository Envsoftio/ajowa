import { isSafeRedirectPath } from '~/shared/auth'

export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore()
  const me = await authStore.fetchMe()

  if (!me) {
    const redirect = isSafeRedirectPath(to.fullPath) ? to.fullPath : undefined
    return navigateTo(redirect ? { path: '/login', query: { redirect } } : '/login')
  }

  if (me.access.requiresPasswordChange && to.path !== '/change-password') {
    return navigateTo('/change-password')
  }

  if (me.access.requiresEmailVerification && to.path !== '/verify-email') {
    return navigateTo('/verify-email')
  }

  if (to.path === '/change-password' || to.path === '/verify-email') {
    return
  }

  if (!me.access.hasAppAccess && to.path !== '/forbidden') {
    return navigateTo('/forbidden')
  }
})
