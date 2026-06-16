<script setup lang="ts">
definePageMeta({
  layout: 'public',
  middleware: ['guest-only'],
  title: 'Reset Password',
})

const route = useRoute()
const toast = useToast()
const token = computed(() => String(route.query.token ?? ''))
const loading = ref(false)
const completed = ref(false)

const form = reactive({
  password: '',
  confirmPassword: '',
})

const submit = async () => {
  if (!token.value) {
    toast.add({
      severity: 'error',
      summary: 'Invalid link',
      detail: 'The reset token is missing.',
      life: 10000,
    })
    return
  }

  if (form.password !== form.confirmPassword) {
    toast.add({
      severity: 'error',
      summary: 'Password mismatch',
      detail: 'Confirm the same password before continuing.',
      life: 10000,
    })
    return
  }

  loading.value = true

  try {
    await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: {
        token: token.value,
        newPassword: form.password,
      },
    })
    completed.value = true
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Reset failed',
      detail: 'This reset link is invalid or expired.',
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
      <Tag severity="danger" value="Secure Reset" rounded />
      <h1>Reset password</h1>
      <p>Create a new password for your AJOWA account.</p>

      <div v-if="completed" class="auth-banner auth-banner-success">
        Password updated. You can sign in now.
      </div>

      <form v-else class="auth-form" @submit.prevent="submit">
        <label>
          <span>New password</span>
          <Password v-model="form.password" toggle-mask :feedback="true" input-class="w-full" autocomplete="new-password" />
        </label>
        <label>
          <span>Confirm password</span>
          <Password v-model="form.confirmPassword" toggle-mask :feedback="false" input-class="w-full" autocomplete="new-password" />
        </label>
        <Button type="submit" label="Update password" :loading="loading" />
      </form>
    </div>
  </section>
</template>
