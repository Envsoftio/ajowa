<script setup lang="ts">
definePageMeta({
  layout: 'public',
  middleware: ['guest-only'],
  title: 'Forgot Password',
})

const email = ref('')
const loading = ref(false)
const sent = ref(false)
const toast = useToast()

const submit = async () => {
  loading.value = true

  try {
    await $fetch('/api/auth/request-password-reset', {
      method: 'POST',
      body: {
        email: email.value,
        redirectTo: `${window.location.origin}/reset-password`,
      },
    })
    sent.value = true
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Request failed',
      detail: 'We could not start the reset flow right now.',
      life: 10000,
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="auth-page">
    <div class="auth-card">
      <Tag severity="info" value="Password Recovery" rounded />
      <h1>Forgot password</h1>
      <p>Enter your account email and we’ll send you a secure reset link.</p>

      <div v-if="sent" class="auth-banner auth-banner-success">
        If the email exists, the reset link is on its way.
      </div>

      <form v-else class="auth-form" @submit.prevent="submit">
        <label>
          <span>Email</span>
          <InputText v-model="email" type="email" autocomplete="email" />
        </label>
        <Button type="submit" label="Send reset link" :loading="loading" />
      </form>
    </div>
  </section>
</template>
