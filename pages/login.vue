<script setup lang="ts">
import { canUserAccessRoute, isSafeRedirectPath } from '~/shared/auth'

definePageMeta({
  layout: 'public',
  middleware: ['guest-only'],
  publicShell: 'compact',
  title: 'Login',
})

const authStore = useAuthStore()
const route = useRoute()
const toast = useToast()
const pushNotifications = usePushNotifications()

const form = reactive({
  email: '',
  password: '',
})
const loading = ref(false)

const sessionExpired = computed(() => route.query.reason === 'session-expired')

const submit = async () => {
  loading.value = true

  try {
    const me = await authStore.login(form)
    const redirect = isSafeRedirectPath(route.query.redirect) ? route.query.redirect : undefined
    const allowedRedirect = me && redirect && canUserAccessRoute(redirect, me.user) ? redirect : undefined

    if (me?.access.requiresPasswordChange) {
      await navigateTo('/change-password', { replace: true })
      return
    }

    if (me?.access.requiresEmailVerification) {
      await navigateTo('/verify-email', { replace: true })
      return
    }

    if (me) {
      void pushNotifications.subscribe({ requestPermission: false, showErrorToast: false })
    }

    await navigateTo(allowedRedirect ?? me?.landingRoute ?? '/', { replace: true })
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Login failed',
      detail: 'Check your credentials and try again.',
      life: 10000,
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="auth-page auth-page--login">
    <div class="auth-card">
      <AppBrandLogo class="auth-card__logo" />
      <Tag severity="contrast" value="Account Access" rounded />
      <h1>Welcome back</h1>
      <p>Sign in with your AJOWA email and password.</p>

      <div v-if="sessionExpired" class="auth-banner auth-banner-warning">
        Your session expired. Sign in again to continue.
      </div>

      <form class="auth-form" @submit.prevent="submit">
        <label>
          <span>Email</span>
          <InputText v-model="form.email" type="email" autocomplete="email" />
        </label>
        <label>
          <span>Password</span>
          <Password v-model="form.password" toggle-mask :feedback="false" input-class="w-full" autocomplete="current-password" />
        </label>
        <Button type="submit" label="Login" :loading="loading" />
      </form>

      <div class="auth-links">
        <NuxtLink to="/forgot-password">Forgot password?</NuxtLink>
      </div>
    </div>
  </section>
</template>
