<script setup lang="ts">
definePageMeta({
  layout: 'public',
  title: 'Forbidden',
})

const authStore = useAuthStore()
await authStore.fetchMe()

const nextRoute = computed(() => {
  const me = authStore.me

  if (!me) {
    return '/login'
  }

  if (me.access.requiresPasswordChange) {
    return '/change-password'
  }

  if (me.access.requiresEmailVerification) {
    return '/verify-email'
  }

  return me.landingRoute
})

const nextLabel = computed(() => (authStore.me ? 'Go to my workspace' : 'Back to login'))
</script>

<template>
  <section class="auth-page">
    <div class="auth-card">
      <Tag severity="danger" value="403" rounded />
      <h1>Permission denied</h1>
      <p>Your account is signed in, but this route or action is outside your current AJOWA access.</p>
      <div class="auth-actions">
        <NuxtLink class="auth-inline-link" :to="nextRoute">{{ nextLabel }}</NuxtLink>
      </div>
    </div>
  </section>
</template>
