<script setup lang="ts">
import type { SocietyProfile } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Society Profile',
})

const api = useApi()
const toast = useToast()

const { data, pending, refresh } = await useAsyncData(
  'admin-society-profile',
  () => api<{ ok: true; data: SocietyProfile }>('/api/admin/society/profile'),
)

const form = reactive({
  name: '',
  registrationNumber: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
  contactEmail: '',
  contactPhone: '',
  timezone: 'Asia/Kolkata',
  settings: {
    billingTenure: 'MONTHLY',
    excessPaymentHandling: 'KEEP_AS_ADVANCE',
    tenantPaymentsEnabled: true,
    familyAccessEnabled: true,
    notificationScope: 'CONFIGURABLE',
    financeApprovalRequired: true,
    attachmentsRequired: true,
    highValueThreshold: 10000,
    graceDays: 0,
    lateFeePerDay: 50,
  },
})

watchEffect(() => {
  const profile = data.value?.data

  if (!profile) {
    return
  }

  form.name = profile.name
  form.registrationNumber = profile.registrationNumber ?? ''
  form.addressLine1 = profile.addressLine1
  form.addressLine2 = profile.addressLine2 ?? ''
  form.city = profile.city
  form.state = profile.state
  form.pincode = profile.pincode
  form.contactEmail = profile.contactEmail ?? ''
  form.contactPhone = profile.contactPhone ?? ''
  form.timezone = profile.timezone
  form.settings = { ...profile.settings }
})

const saving = ref(false)

const nullableText = (value: unknown) => {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length > 0 ? trimmed : null
}

const nonNegativeNumber = (value: unknown, fallback: number) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

const nonNegativeInteger = (value: unknown, fallback: number) => {
  const number = nonNegativeNumber(value, fallback)
  return Number.isInteger(number) ? number : fallback
}

const buildPayload = () => ({
  name: form.name.trim(),
  registrationNumber: nullableText(form.registrationNumber),
  addressLine1: form.addressLine1.trim(),
  addressLine2: nullableText(form.addressLine2),
  city: form.city.trim(),
  state: form.state.trim(),
  pincode: form.pincode.trim(),
  contactEmail: nullableText(form.contactEmail),
  contactPhone: nullableText(form.contactPhone),
  timezone: form.timezone.trim() || 'Asia/Kolkata',
  settings: {
    billingTenure: form.settings.billingTenure,
    excessPaymentHandling: form.settings.excessPaymentHandling,
    tenantPaymentsEnabled: Boolean(form.settings.tenantPaymentsEnabled),
    familyAccessEnabled: Boolean(form.settings.familyAccessEnabled),
    notificationScope: form.settings.notificationScope,
    financeApprovalRequired: Boolean(form.settings.financeApprovalRequired),
    attachmentsRequired: Boolean(form.settings.attachmentsRequired),
    highValueThreshold: nonNegativeNumber(
      form.settings.highValueThreshold,
      10000,
    ),
    graceDays: nonNegativeInteger(form.settings.graceDays, 0),
    lateFeePerDay: nonNegativeNumber(form.settings.lateFeePerDay, 50),
  },
})

const submit = async () => {
  saving.value = true

  try {
    await api('/api/admin/society/profile', {
      method: 'PUT',
      body: buildPayload(),
    })

    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: 'Society profile and policies were updated.',
      life: 10000,
    })
    await refresh()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="landing-page">
    <form class="admin-form-layout" @submit.prevent="submit">
      <section class="surface-card admin-form-section">
        <div class="admin-form-section__header">
          <div>
            <p class="eyebrow">Profile</p>
            <h2>Society identity</h2>
          </div>
          <Button
            type="submit"
            label="Save profile"
            :loading="saving || pending"
          />
        </div>

        <div class="admin-form-grid">
          <label>
            <span>Name</span>
            <InputText v-model="form.name" />
          </label>
          <label>
            <span>Registration number</span>
            <InputText v-model="form.registrationNumber" />
          </label>
          <label class="admin-form-grid__full">
            <span>Address line 1</span>
            <InputText v-model="form.addressLine1" />
          </label>
          <label class="admin-form-grid__full">
            <span>Address line 2</span>
            <InputText v-model="form.addressLine2" />
          </label>
          <label>
            <span>City</span>
            <InputText v-model="form.city" />
          </label>
          <label>
            <span>State</span>
            <InputText v-model="form.state" />
          </label>
          <label>
            <span>Pincode</span>
            <InputText v-model="form.pincode" />
          </label>
          <label>
            <span>Timezone</span>
            <InputText v-model="form.timezone" />
          </label>
          <label>
            <span>Contact email</span>
            <InputText v-model="form.contactEmail" type="email" />
          </label>
          <label>
            <span>Contact phone</span>
            <InputText v-model="form.contactPhone" />
          </label>
        </div>
      </section>

      <section class="surface-card admin-form-section">
        <div class="admin-form-section__header">
          <div>
            <p class="eyebrow">Policies</p>
            <h2>Billing, access, and approvals</h2>
          </div>
        </div>

        <div class="admin-form-grid">
          <label>
            <span>Billing tenure</span>
            <Select
              v-model="form.settings.billingTenure"
              :options="[
                'MONTHLY',
                'QUARTERLY',
                'HALF_YEARLY',
                'YEARLY',
                'CUSTOM',
              ]"
            />
          </label>
          <label>
            <span>Excess payment handling</span>
            <Select
              v-model="form.settings.excessPaymentHandling"
              :options="['KEEP_AS_ADVANCE', 'REFUND', 'MANUAL_REVIEW']"
            />
          </label>
          <label>
            <span>Notification scope</span>
            <Select
              v-model="form.settings.notificationScope"
              :options="['ADMIN_ONLY', 'ADMIN_AND_MANAGER', 'CONFIGURABLE']"
            />
          </label>
          <label>
            <span>High-value threshold</span>
            <InputNumber
              v-model="form.settings.highValueThreshold"
              :min="0"
              input-id="high-value-threshold"
              fluid
            />
          </label>
          <label>
            <span>Grace days</span>
            <InputNumber
              v-model="form.settings.graceDays"
              :min="0"
              input-id="grace-days"
              fluid
            />
          </label>
          <label>
            <span>Late fee per day</span>
            <InputNumber
              v-model="form.settings.lateFeePerDay"
              :min="0"
              input-id="late-fee-per-day"
              fluid
            />
          </label>
        </div>

        <div class="admin-toggle-grid">
          <label class="admin-toggle-card">
            <span>Tenant payments enabled</span>
            <ToggleSwitch v-model="form.settings.tenantPaymentsEnabled" />
          </label>
          <label class="admin-toggle-card">
            <span>Family access enabled</span>
            <ToggleSwitch v-model="form.settings.familyAccessEnabled" />
          </label>
          <label class="admin-toggle-card">
            <span>Finance approval required</span>
            <ToggleSwitch v-model="form.settings.financeApprovalRequired" />
          </label>
          <label class="admin-toggle-card">
            <span>Attachments required</span>
            <ToggleSwitch v-model="form.settings.attachmentsRequired" />
          </label>
        </div>
      </section>
    </form>
  </div>
</template>
