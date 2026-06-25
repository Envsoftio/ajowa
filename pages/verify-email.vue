<script setup lang="ts">
definePageMeta({
  layout: 'public',
  title: 'Verify Email',
})

const authStore = useAuthStore()
const route = useRoute()
const toast = useToast()
const token = computed(() => String(route.query.token ?? ''))
const status = ref<'idle' | 'loading' | 'verified' | 'invalid'>('idle')
const sending = ref(false)

onMounted(async () => {
  if (!token.value) {
    return
  }

  status.value = 'loading'

  try {
    await $fetch('/api/auth/verify-email', {
      method: 'GET',
      query: {
        token: token.value,
      },
    })
    await authStore.fetchMe(true)
    status.value = 'verified'
  } catch {
    status.value = 'invalid'
  }
})

const resend = async () => {
  if (!authStore.me) {
    return
  }

  sending.value = true

  try {
    await $fetch('/api/auth/send-verification-email', {
      method: 'POST',
      body: {
        email: authStore.me.authUser.email,
      },
    })
    toast.add({
      severity: 'success',
      summary: 'Email sent',
      detail: 'A fresh verification link is on the way.',
      life: 10000,
    })
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Unable to resend',
      detail: 'Try again in a moment.',
      life: 10000,
    })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <section class="auth-page">
    <div class="auth-card">
      <AppBrandLogo class="auth-card__logo" />
      <Tag severity="info" value="Email Verification" rounded />
      <h1>Verify your email</h1>
      <p>AJOWA needs a verified email before your access becomes fully active.</p>

      <div v-if="status === 'verified'" class="auth-banner auth-banner-success">
        Your email is verified. You can continue now.
      </div>
      <div v-else-if="status === 'invalid'" class="auth-banner auth-banner-danger">
        This verification link is invalid or expired.
      </div>
      <div v-else-if="status === 'loading'" class="auth-banner auth-banner-info">
        Verifying your email now.
      </div>
      <div v-else class="auth-banner auth-banner-info">
        Use the latest verification link from your inbox, or resend it below.
      </div>

      <div class="auth-actions">
        <Button label="Resend verification email" :loading="sending" @click="resend" />
        <NuxtLink class="auth-inline-link" to="/login">Back to login</NuxtLink>
      </div>
    </div>
  </section>
</template>
