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

const emptyTextMarkers = new Set(['', 'NA', 'N/A', 'NIL', '-', '--'])
const billingTenures = [
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY',
  'CUSTOM',
] as const
const excessPaymentHandlingOptions = [
  'KEEP_AS_ADVANCE',
  'REFUND',
  'MANUAL_REVIEW',
] as const
const notificationScopes = [
  'ADMIN_ONLY',
  'ADMIN_AND_MANAGER',
  'CONFIGURABLE',
] as const

type SocietyField =
  | 'name'
  | 'registrationNumber'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'state'
  | 'pincode'
  | 'contactEmail'
  | 'contactPhone'
  | 'timezone'
  | 'settings.billingTenure'
  | 'settings.excessPaymentHandling'
  | 'settings.notificationScope'
  | 'settings.highValueThreshold'
  | 'settings.graceDays'
  | 'settings.lateFeePerDay'

const fieldErrors = ref<Partial<Record<SocietyField, string>>>({})

const nullableText = (value: unknown) => {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return emptyTextMarkers.has(trimmed.toUpperCase()) ? null : trimmed
}

const nonNegativeNumber = (value: unknown, fallback: number) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

const nonNegativeInteger = (value: unknown, fallback: number) => {
  const number = nonNegativeNumber(value, fallback)
  return Number.isInteger(number) ? number : fallback
}

const clearFieldErrors = () => {
  fieldErrors.value = {}
}

const setFieldError = (field: SocietyField, message: string) => {
  if (!fieldErrors.value[field]) {
    fieldErrors.value[field] = message
  }
}

const fieldError = (field: SocietyField) => fieldErrors.value[field]

const isNullableMarker = (value: unknown) =>
  typeof value !== 'string' || emptyTextMarkers.has(value.trim().toUpperCase())

const optionalTextLengthValid = (field: SocietyField, value: unknown, maxLength: number) => {
  if (isNullableMarker(value)) {
    return
  }

  if (typeof value === 'string' && value.trim().length > maxLength) {
    setFieldError(field, `Keep this to ${maxLength} characters or fewer.`)
  }
}

const requireText = (field: SocietyField, value: unknown, label: string, minLength: number) => {
  const text = typeof value === 'string' ? value.trim() : ''

  if (text.length < minLength) {
    setFieldError(field, `${label} must be at least ${minLength} characters.`)
  }
}

const requireEnum = <T extends readonly string[]>(
  field: SocietyField,
  value: unknown,
  options: T,
  label: string,
) => {
  if (typeof value !== 'string' || !options.includes(value)) {
    setFieldError(field, `Choose a valid ${label}.`)
  }
}

const requireNonNegativeNumber = (field: SocietyField, value: unknown, label: string) => {
  const number = Number(value)

  if (!Number.isFinite(number) || number < 0) {
    setFieldError(field, `${label} must be zero or more.`)
  }
}

const requireNonNegativeInteger = (field: SocietyField, value: unknown, label: string) => {
  const number = Number(value)

  if (!Number.isInteger(number) || number < 0) {
    setFieldError(field, `${label} must be a whole number zero or more.`)
  }
}

const validateProfileForm = () => {
  clearFieldErrors()

  requireText('name', form.name, 'Name', 2)
  requireText('addressLine1', form.addressLine1, 'Address line 1', 2)
  requireText('city', form.city, 'City', 2)
  requireText('state', form.state, 'State', 2)
  requireText('pincode', form.pincode, 'Pincode', 1)
  requireText('timezone', form.timezone, 'Timezone', 3)

  if (form.pincode.trim().length > 30) {
    setFieldError('pincode', 'Keep pincode to 30 characters or fewer.')
  }

  optionalTextLengthValid('registrationNumber', form.registrationNumber, 150)
  optionalTextLengthValid('addressLine2', form.addressLine2, 300)
  optionalTextLengthValid('contactPhone', form.contactPhone, 40)

  const contactEmail = nullableText(form.contactEmail)

  if (typeof contactEmail === 'string') {
    if (contactEmail.length > 254) {
      setFieldError('contactEmail', 'Keep contact email to 254 characters or fewer.')
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      setFieldError('contactEmail', 'Enter a valid contact email.')
    }
  }

  requireEnum('settings.billingTenure', form.settings.billingTenure, billingTenures, 'billing tenure')
  requireEnum(
    'settings.excessPaymentHandling',
    form.settings.excessPaymentHandling,
    excessPaymentHandlingOptions,
    'excess payment handling',
  )
  requireEnum(
    'settings.notificationScope',
    form.settings.notificationScope,
    notificationScopes,
    'notification scope',
  )
  requireNonNegativeNumber(
    'settings.highValueThreshold',
    form.settings.highValueThreshold,
    'High-value threshold',
  )
  requireNonNegativeInteger('settings.graceDays', form.settings.graceDays, 'Grace days')
  requireNonNegativeNumber('settings.lateFeePerDay', form.settings.lateFeePerDay, 'Late fee per day')

  const firstError = Object.values(fieldErrors.value)[0]

  if (firstError) {
    toast.add({
      severity: 'warn',
      summary: 'Check profile fields',
      detail: firstError,
      life: 10000,
    })
    return false
  }

  return true
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
  if (!validateProfileForm()) {
    return
  }

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
    <form class="admin-form-layout" novalidate @submit.prevent="submit">
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
            <InputText v-model="form.name" :invalid="Boolean(fieldError('name'))" />
            <small v-if="fieldError('name')" class="field-error">{{ fieldError('name') }}</small>
          </label>
          <label>
            <span>Registration number</span>
            <InputText
              v-model="form.registrationNumber"
              maxlength="150"
              :invalid="Boolean(fieldError('registrationNumber'))"
            />
            <small v-if="fieldError('registrationNumber')" class="field-error">{{ fieldError('registrationNumber') }}</small>
          </label>
          <label class="admin-form-grid__full">
            <span>Address line 1</span>
            <InputText v-model="form.addressLine1" :invalid="Boolean(fieldError('addressLine1'))" />
            <small v-if="fieldError('addressLine1')" class="field-error">{{ fieldError('addressLine1') }}</small>
          </label>
          <label class="admin-form-grid__full">
            <span>Address line 2</span>
            <InputText
              v-model="form.addressLine2"
              maxlength="300"
              :invalid="Boolean(fieldError('addressLine2'))"
            />
            <small v-if="fieldError('addressLine2')" class="field-error">{{ fieldError('addressLine2') }}</small>
          </label>
          <label>
            <span>City</span>
            <InputText v-model="form.city" :invalid="Boolean(fieldError('city'))" />
            <small v-if="fieldError('city')" class="field-error">{{ fieldError('city') }}</small>
          </label>
          <label>
            <span>State</span>
            <InputText v-model="form.state" :invalid="Boolean(fieldError('state'))" />
            <small v-if="fieldError('state')" class="field-error">{{ fieldError('state') }}</small>
          </label>
          <label>
            <span>Pincode</span>
            <InputText v-model="form.pincode" maxlength="30" :invalid="Boolean(fieldError('pincode'))" />
            <small v-if="fieldError('pincode')" class="field-error">{{ fieldError('pincode') }}</small>
          </label>
          <label>
            <span>Timezone</span>
            <InputText v-model="form.timezone" :invalid="Boolean(fieldError('timezone'))" />
            <small v-if="fieldError('timezone')" class="field-error">{{ fieldError('timezone') }}</small>
          </label>
          <label>
            <span>Contact email</span>
            <InputText
              v-model="form.contactEmail"
              type="email"
              maxlength="254"
              :invalid="Boolean(fieldError('contactEmail'))"
            />
            <small v-if="fieldError('contactEmail')" class="field-error">{{ fieldError('contactEmail') }}</small>
          </label>
          <label>
            <span>Contact phone</span>
            <InputText
              v-model="form.contactPhone"
              maxlength="40"
              :invalid="Boolean(fieldError('contactPhone'))"
            />
            <small v-if="fieldError('contactPhone')" class="field-error">{{ fieldError('contactPhone') }}</small>
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
          <!-- TODO: Re-enable when billingTenure drives default billing cycle creation/frequency. -->
          <!--
          <label>
            <span>Billing tenure</span>
            <Select
              v-model="form.settings.billingTenure"
              :options="[...billingTenures]"
              :invalid="Boolean(fieldError('settings.billingTenure'))"
            />
            <small v-if="fieldError('settings.billingTenure')" class="field-error">{{ fieldError('settings.billingTenure') }}</small>
          </label>
          -->
          <label>
            <span>Excess payment handling</span>
            <Select
              v-model="form.settings.excessPaymentHandling"
              :options="[...excessPaymentHandlingOptions]"
              :invalid="Boolean(fieldError('settings.excessPaymentHandling'))"
            />
            <small v-if="fieldError('settings.excessPaymentHandling')" class="field-error">{{ fieldError('settings.excessPaymentHandling') }}</small>
          </label>
          <!-- TODO: Re-enable when notificationScope restricts notification send/configure permissions. -->
          <!--
          <label>
            <span>Notification scope</span>
            <Select
              v-model="form.settings.notificationScope"
              :options="[...notificationScopes]"
              :invalid="Boolean(fieldError('settings.notificationScope'))"
            />
            <small v-if="fieldError('settings.notificationScope')" class="field-error">{{ fieldError('settings.notificationScope') }}</small>
          </label>
          -->
          <!-- TODO: Re-enable when highValueThreshold is enforced by backend review/confirmation rules. -->
          <!--
          <label>
            <span>High-value threshold</span>
            <InputNumber
              v-model="form.settings.highValueThreshold"
              :min="0"
              input-id="high-value-threshold"
              fluid
              :invalid="Boolean(fieldError('settings.highValueThreshold'))"
            />
            <small v-if="fieldError('settings.highValueThreshold')" class="field-error">{{ fieldError('settings.highValueThreshold') }}</small>
          </label>
          -->
          <label>
            <span>Grace days</span>
            <InputNumber
              v-model="form.settings.graceDays"
              :min="0"
              input-id="grace-days"
              fluid
              :invalid="Boolean(fieldError('settings.graceDays'))"
            />
            <small v-if="fieldError('settings.graceDays')" class="field-error">{{ fieldError('settings.graceDays') }}</small>
          </label>
          <label>
            <span>Late fee per day</span>
            <InputNumber
              v-model="form.settings.lateFeePerDay"
              :min="0"
              input-id="late-fee-per-day"
              fluid
              :invalid="Boolean(fieldError('settings.lateFeePerDay'))"
            />
            <small v-if="fieldError('settings.lateFeePerDay')" class="field-error">{{ fieldError('settings.lateFeePerDay') }}</small>
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
          <!-- TODO: Re-enable when attachmentsRequired is also enforced by the backend finance APIs. -->
          <!--
          <label class="admin-toggle-card">
            <span>Attachments required</span>
            <ToggleSwitch v-model="form.settings.attachmentsRequired" />
          </label>
          -->
        </div>
      </section>
    </form>
  </div>
</template>
