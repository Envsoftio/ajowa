export default defineNuxtRouteMiddleware(async () => {
  const authStore = useAuthStore()
  const me = await authStore.fetchMe()

  if (!me) {
    return
  }

  if (me.access.requiresPasswordChange) {
    return navigateTo('/change-password', { replace: true })
  }

  if (me.access.requiresEmailVerification) {
    return navigateTo('/verify-email', { replace: true })
  }

  return navigateTo(me.landingRoute, { replace: true })
})
