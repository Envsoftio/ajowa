<script setup lang="ts">
import { getApiErrorMessage } from '~/composables/useApi'
import { getPasswordPolicyMessage } from '~/shared/auth'

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
      life: 10000,
    })
    return
  }

  const policyMessage = getPasswordPolicyMessage(form.newPassword)

  if (policyMessage) {
    toast.add({
      severity: 'error',
      summary: 'Password is too weak',
      detail: policyMessage,
      life: 10000,
    })
    return
  }

  loading.value = true

  try {
    await $fetch('/api/auth/complete-password-change', {
      method: 'POST',
      credentials: 'include',
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
    toast.add({
      severity: 'error',
      summary: 'Password change failed',
      detail: getApiErrorMessage(error, 'Check your current password and try again.'),
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
