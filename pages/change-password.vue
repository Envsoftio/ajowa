<script setup lang="ts">
definePageMeta({
  layout: 'public',
  middleware: ['protected'],
  title: 'Change Password',
})

const authStore = useAuthStore()
const toast = useToast()
const loading = ref(false)
const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const submit = async () => {
  if (form.newPassword !== form.confirmPassword) {
    toast.add({
      severity: 'error',
      summary: 'Password mismatch',
      detail: 'Confirm the same password before continuing.',
      life: 5000,
    })
    return
  }

  loading.value = true

  try {
    await $fetch('/api/auth/complete-password-change', {
      method: 'POST',
      body: {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      },
    })

    const me = await authStore.fetchMe(true)

    if (me?.access.requiresEmailVerification) {
      await navigateTo('/verify-email')
      return
    }

    await navigateTo(me?.landingRoute ?? '/')
  } catch (error) {
    const fetchError = error as { data?: { message?: string } }
    toast.add({
      severity: 'error',
      summary: 'Password change failed',
      detail: fetchError.data?.message ?? 'Check your current password and try again.',
      life: 5000,
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="auth-page">
    <div class="auth-card">
      <Tag severity="contrast" value="First Login" rounded />
      <h1>Change your password</h1>
      <p>AJOWA requires a permanent password before protected access is unlocked.</p>

      <form class="auth-form" @submit.prevent="submit">
        <label>
          <span>Current password</span>
          <Password v-model="form.currentPassword" toggle-mask :feedback="false" input-class="w-full" autocomplete="current-password" />
        </label>
        <label>
          <span>New password</span>
          <Password v-model="form.newPassword" toggle-mask :feedback="true" input-class="w-full" autocomplete="new-password" />
        </label>
        <label>
          <span>Confirm password</span>
          <Password v-model="form.confirmPassword" toggle-mask :feedback="false" input-class="w-full" autocomplete="new-password" />
        </label>
        <Button type="submit" label="Save new password" :loading="loading" />
      </form>
    </div>
  </section>
</template>
