<script setup lang="ts">
import type { SocietyProfile } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Society Profile',
})

const api = useApi()
const toast = useToast()

const { data, pending, refresh } = await useAsyncData('admin-society-profile', () =>
  api<{ ok: true; data: SocietyProfile }>('/api/admin/society/profile'),
)

const form = reactive({
  name: '',
  registrationNumber: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
  logoPath: '',
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
  form.logoPath = profile.logoPath ?? ''
  form.contactEmail = profile.contactEmail ?? ''
  form.contactPhone = profile.contactPhone ?? ''
  form.timezone = profile.timezone
  form.settings = { ...profile.settings }
})

const saving = ref(false)

const submit = async () => {
  saving.value = true

  try {
    await api('/api/admin/society/profile', {
      method: 'PUT',
      body: {
        ...form,
        registrationNumber: form.registrationNumber || null,
        addressLine2: form.addressLine2 || null,
        logoPath: form.logoPath || null,
        contactEmail: form.contactEmail || null,
        contactPhone: form.contactPhone || null,
      },
    })

    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: 'Society profile and policies were updated.',
      life: 3000,
    })
    await refresh()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="landing-page">
    <section class="hero-panel">
      <Tag severity="contrast" value="Phase 5" rounded />
      <h1>Society profile and master policies</h1>
      <p>
        Manage the AJOWA identity, billing preferences, finance controls, and resident-access policies that downstream modules depend on.
      </p>
    </section>

    <form class="admin-form-layout" @submit.prevent="submit">
      <section class="surface-card admin-form-section">
        <div class="admin-form-section__header">
          <div>
            <p class="eyebrow">Profile</p>
            <h2>Society identity</h2>
          </div>
          <Button type="submit" label="Save profile" :loading="saving || pending" />
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
          <label class="admin-form-grid__full">
            <span>Logo path</span>
            <InputText v-model="form.logoPath" />
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
              :options="['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM']"
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
            <InputNumber v-model="form.settings.highValueThreshold" :min="0" input-id="high-value-threshold" fluid />
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
