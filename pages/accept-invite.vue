<script setup lang="ts">
import type { InvitePreview } from '~/types/auth'

definePageMeta({
  layout: 'public',
  middleware: ['guest-only'],
  title: 'Accept Invite',
})

const route = useRoute()
const toast = useToast()
const token = computed(() => String(route.query.token ?? ''))
const invite = ref<InvitePreview | null>(null)
const loadingInvite = ref(false)
const submitting = ref(false)

const form = reactive({
  fullName: '',
  mobileNumber: '',
  whatsappNumber: '',
  password: '',
  confirmPassword: '',
})

const loadInvite = async () => {
  if (!token.value) {
    return
  }

  loadingInvite.value = true

  try {
    const response = await $fetch<{ ok: true; data: InvitePreview }>('/api/auth/invite', {
      query: {
        token: token.value,
      },
    })
    invite.value = response.data
    form.fullName = response.data.fullName ?? ''
    form.mobileNumber = response.data.mobileNumber ?? ''
    form.whatsappNumber = response.data.mobileNumber ?? ''
  } catch {
    invite.value = null
  } finally {
    loadingInvite.value = false
  }
}

onMounted(loadInvite)

const submit = async () => {
  if (!invite.value) {
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

  submitting.value = true

  try {
    const response = await $fetch<{
      ok: true
      data: {
        email: string
        requiresEmailVerification: boolean
        verificationEmailDelivery?: {
          delivered: boolean
          reason?: string
        } | null
      }
    }>('/api/auth/accept-invite', {
      method: 'POST',
      body: {
        token: token.value,
        fullName: form.fullName,
        mobileNumber: form.mobileNumber,
        whatsappNumber: form.whatsappNumber,
        password: form.password,
      },
    })
    const verificationEmail = response.data.verificationEmailDelivery
    const verificationWarning =
      verificationEmail && !verificationEmail.delivered
        ? (verificationEmail.reason ?? 'Your account is ready, but verification email delivery failed.')
        : ''

    toast.add({
      severity: verificationWarning ? 'warn' : 'success',
      summary: 'Invite accepted',
      detail: verificationWarning || (response.data.requiresEmailVerification
        ? 'Your account is ready. Verify your email after you sign in.'
        : 'Your account is ready. You can sign in now.'),
      life: 10000,
    })
    await navigateTo('/login')
  } catch (error) {
    const fetchError = error as { data?: { message?: string } }
    toast.add({
      severity: 'error',
      summary: 'Invite failed',
      detail: fetchError.data?.message ?? 'This invite could not be accepted.',
      life: 10000,
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="auth-page">
    <div class="auth-card">
      <Tag severity="success" value="Invitation" rounded />
      <h1>Accept your invite</h1>
      <p>Finish your profile, choose a password, and activate your AJOWA account.</p>

      <div v-if="loadingInvite" class="auth-banner auth-banner-info">
        Loading your invite.
      </div>
      <div v-else-if="!invite" class="auth-banner auth-banner-danger">
        This invite is invalid, expired, or already used.
      </div>
      <template v-else>
        <div class="auth-banner auth-banner-info">
          <strong>{{ invite.email }}</strong> invited as {{ invite.role.replace('_', ' ') }}.
          <span v-if="invite.flatLabels.length"> Flats: {{ invite.flatLabels.join(', ') }}.</span>
          <span v-if="invite.departmentNames.length"> Departments: {{ invite.departmentNames.join(', ') }}.</span>
        </div>

        <form class="auth-form" @submit.prevent="submit">
          <label>
            <span>Full name</span>
            <InputText v-model="form.fullName" autocomplete="name" />
          </label>
          <label>
            <span>Mobile number</span>
            <InputText v-model="form.mobileNumber" type="tel" autocomplete="tel" />
          </label>
          <label>
            <span>WhatsApp number</span>
            <InputText v-model="form.whatsappNumber" type="tel" autocomplete="tel" />
          </label>
          <label>
            <span>Password</span>
            <Password v-model="form.password" toggle-mask :feedback="true" input-class="w-full" autocomplete="new-password" />
          </label>
          <label>
            <span>Confirm password</span>
            <Password v-model="form.confirmPassword" toggle-mask :feedback="false" input-class="w-full" autocomplete="new-password" />
          </label>
          <Button type="submit" label="Accept invite" :loading="submitting" />
        </form>
      </template>
    </div>
  </section>
</template>
