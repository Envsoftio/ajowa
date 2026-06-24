<script setup lang="ts">
import type {
  AccountHead,
  BankAccount,
  BankAccountType,
  SocietyPaymentQrFile,
  SocietyProfile,
} from '~/types/domain'

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

type AccountsResponse = { ok: true; data: { items: AccountHead[] } }
type BankAccountsResponse = { ok: true; data: { items: BankAccount[] } }
type PaymentQrResponse = { ok: true; data: SocietyPaymentQrFile }

const { data: accountData, pending: accountsPending } = await useAsyncData(
  'admin-society-asset-accounts',
  () =>
    api<AccountsResponse>('/api/admin/finance/accounts', {
      query: {
        headType: 'ASSET',
        isActive: 'true',
      },
    }),
)

const {
  data: bankAccountData,
  pending: bankAccountsPending,
  refresh: refreshBankAccounts,
} = await useAsyncData('admin-society-bank-accounts', () =>
  api<BankAccountsResponse>('/api/admin/finance/bank-accounts'),
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

const bankForm = reactive<{
  bankName: string
  accountName: string
  accountNumber: string
  ifscCode: string
  accountType: BankAccountType
  branchName: string
  upiId: string
  accountHeadId: string
}>({
  bankName: '',
  accountName: '',
  accountNumber: '',
  ifscCode: '',
  accountType: 'CURRENT',
  branchName: '',
  upiId: '',
  accountHeadId: '',
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
const savingBankDetails = ref(false)
const uploadingPaymentQr = ref(false)
const removingPaymentQr = ref(false)
const paymentQrInput = ref<HTMLInputElement | null>(null)
const paymentQrPreviewUrl = ref('')
const paymentQrPreviewFileId = ref('')
let paymentQrPreviewRequestId = 0

const emptyTextMarkers = new Set(['', 'NA', 'N/A', 'NIL', '-', '--'])
const paymentQrAcceptedMimeTypes = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
] as const
const paymentQrAccept = [
  ...paymentQrAcceptedMimeTypes,
  '.jpg',
  '.jpeg',
  '.png',
].join(',')
const paymentQrMaxSizeBytes = 10 * 1024 * 1024
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
const bankAccountTypes: { label: string; value: BankAccountType }[] = [
  { label: 'Savings', value: 'SAVINGS' },
  { label: 'Current', value: 'CURRENT' },
  { label: 'Cash credit', value: 'CASH_CREDIT' },
  { label: 'Overdraft', value: 'OVERDRAFT' },
  { label: 'Other', value: 'OTHER' },
]

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

const assetAccountOptions = computed(() =>
  (accountData.value?.data.items ?? []).map((account) => ({
    label: `${'  '.repeat(account.level)}${account.code} - ${account.name}`,
    value: account.id,
  })),
)

const bankAccounts = computed(() => bankAccountData.value?.data.items ?? [])
const paymentQrFile = computed(() => data.value?.data.paymentQrFile ?? null)
const paymentQrImageUrl = computed(() => paymentQrPreviewUrl.value)
const societyPaymentAccount = computed(
  () =>
    bankAccounts.value.find(
      (account) => account.isDefault && account.isActive,
    ) ??
    bankAccounts.value.find((account) => account.isActive) ??
    bankAccounts.value[0] ??
    null,
)

watch(
  [societyPaymentAccount, assetAccountOptions],
  ([account, accountOptions]) => {
    bankForm.bankName = account?.bankName ?? ''
    bankForm.accountName = account?.accountName ?? ''
    bankForm.accountNumber = ''
    bankForm.ifscCode = account?.ifscCode ?? ''
    bankForm.accountType = account?.accountType ?? 'CURRENT'
    bankForm.branchName = account?.branchName ?? ''
    bankForm.upiId = account?.upiId ?? ''
    bankForm.accountHeadId =
      account?.accountHeadId ?? accountOptions[0]?.value ?? ''
  },
  { immediate: true },
)

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

const formatFileSize = (sizeBytes: number) => {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return '-'
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  const sizeKb = sizeBytes / 1024
  if (sizeKb < 1024) {
    return `${sizeKb.toFixed(sizeKb >= 100 ? 0 : 1)} KB`
  }

  const sizeMb = sizeKb / 1024
  return `${sizeMb.toFixed(sizeMb >= 100 ? 0 : 1)} MB`
}

const pickPaymentQr = () => {
  paymentQrInput.value?.click()
}

const clearPaymentQrPreview = () => {
  if (paymentQrPreviewUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(paymentQrPreviewUrl.value)
  }

  paymentQrPreviewUrl.value = ''
  paymentQrPreviewFileId.value = ''
}

const setPaymentQrPreviewObjectUrl = (objectUrl: string, fileId: string) => {
  clearPaymentQrPreview()
  paymentQrPreviewUrl.value = objectUrl
  paymentQrPreviewFileId.value = fileId
}

const loadSavedPaymentQrPreview = async (file: SocietyPaymentQrFile | null) => {
  if (!import.meta.client) {
    return
  }

  if (!file) {
    paymentQrPreviewRequestId += 1
    clearPaymentQrPreview()
    return
  }

  if (paymentQrPreviewFileId.value === file.id && paymentQrPreviewUrl.value) {
    return
  }

  const requestId = ++paymentQrPreviewRequestId

  try {
    const response = await fetch(
      `${file.downloadUrl}?v=${encodeURIComponent(file.id)}`,
      {
        credentials: 'include',
        cache: 'no-store',
      },
    )

    if (!response.ok) {
      throw new Error('Unable to load the saved payment QR preview.')
    }

    const objectUrl = URL.createObjectURL(await response.blob())

    if (requestId !== paymentQrPreviewRequestId) {
      URL.revokeObjectURL(objectUrl)
      return
    }

    setPaymentQrPreviewObjectUrl(objectUrl, file.id)
  } catch (error) {
    if (requestId === paymentQrPreviewRequestId) {
      clearPaymentQrPreview()
      console.warn(
        JSON.stringify({
          level: 'warn',
          message: 'Unable to load payment QR preview.',
          fileId: file.id,
          cause: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }
}

onBeforeUnmount(() => {
  paymentQrPreviewRequestId += 1
  clearPaymentQrPreview()
})

watch(
  paymentQrFile,
  (file) => {
    void loadSavedPaymentQrPreview(file)
  },
  { immediate: true },
)

onMounted(() => {
  void loadSavedPaymentQrPreview(paymentQrFile.value)
})

const uploadPaymentQr = async (file: File) => {
  if (
    !paymentQrAcceptedMimeTypes.includes(
      file.type as (typeof paymentQrAcceptedMimeTypes)[number],
    )
  ) {
    toast.add({
      severity: 'warn',
      summary: 'Unsupported QR image',
      detail: 'Upload a PNG or JPG payment QR code.',
      life: 10000,
    })
    return
  }

  if (file.size > paymentQrMaxSizeBytes) {
    toast.add({
      severity: 'warn',
      summary: 'QR image too large',
      detail: 'Payment QR image must be 10 MB or smaller.',
      life: 10000,
    })
    return
  }

  const formData = new FormData()
  formData.append('file', file)
  uploadingPaymentQr.value = true

  try {
    const response = await api<PaymentQrResponse>('/api/admin/society/payment-qr', {
      method: 'POST',
      body: formData,
    })
    if (data.value?.data) {
      data.value.data.paymentQrFile = response.data
    } else {
      await refresh()
    }
    await loadSavedPaymentQrPreview(response.data)
    toast.add({
      severity: 'success',
      summary: 'QR saved',
      detail: 'Payment QR code was updated.',
      life: 10000,
    })
  } finally {
    uploadingPaymentQr.value = false
  }
}

const onPaymentQrChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (file) {
    void uploadPaymentQr(file)
  }

  target.value = ''
}

const removePaymentQr = async () => {
  if (!paymentQrFile.value) {
    return
  }

  removingPaymentQr.value = true

  try {
    await api('/api/admin/society/payment-qr', {
      method: 'DELETE',
    })
    clearPaymentQrPreview()
    if (data.value?.data) {
      data.value.data.paymentQrFile = null
    }
    toast.add({
      severity: 'success',
      summary: 'QR removed',
      detail: 'Payment QR code was removed.',
      life: 10000,
    })
  } finally {
    removingPaymentQr.value = false
  }
}

const isNullableMarker = (value: unknown) =>
  typeof value !== 'string' || emptyTextMarkers.has(value.trim().toUpperCase())

const optionalTextLengthValid = (
  field: SocietyField,
  value: unknown,
  maxLength: number,
) => {
  if (isNullableMarker(value)) {
    return
  }

  if (typeof value === 'string' && value.trim().length > maxLength) {
    setFieldError(field, `Keep this to ${maxLength} characters or fewer.`)
  }
}

const requireText = (
  field: SocietyField,
  value: unknown,
  label: string,
  minLength: number,
) => {
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

const requireNonNegativeNumber = (
  field: SocietyField,
  value: unknown,
  label: string,
) => {
  const number = Number(value)

  if (!Number.isFinite(number) || number < 0) {
    setFieldError(field, `${label} must be zero or more.`)
  }
}

const requireNonNegativeInteger = (
  field: SocietyField,
  value: unknown,
  label: string,
) => {
  const number = Number(value)

  if (!Number.isInteger(number) || number < 0) {
    setFieldError(field, `${label} must be a whole number zero or more.`)
  }
}

const validateBankDetailsForm = () => {
  const bankName = bankForm.bankName.trim()
  const accountName = bankForm.accountName.trim()
  const accountNumber = bankForm.accountNumber.trim()
  const ifscCode = bankForm.ifscCode.trim()

  if (!bankForm.accountHeadId) {
    toast.add({
      severity: 'warn',
      summary: 'Asset account required',
      detail: 'Create or choose an Asset account before saving bank details.',
      life: 10000,
    })
    return false
  }

  if (bankName.length < 2 || accountName.length < 2 || ifscCode.length < 4) {
    toast.add({
      severity: 'warn',
      summary: 'Check bank details',
      detail: 'Bank, account name, and IFSC are required.',
      life: 10000,
    })
    return false
  }

  if (!societyPaymentAccount.value && accountNumber.length < 4) {
    toast.add({
      severity: 'warn',
      summary: 'Account number required',
      detail: 'Enter the account number for the society payment account.',
      life: 10000,
    })
    return false
  }

  return true
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
      setFieldError(
        'contactEmail',
        'Keep contact email to 254 characters or fewer.',
      )
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      setFieldError('contactEmail', 'Enter a valid contact email.')
    }
  }

  requireEnum(
    'settings.billingTenure',
    form.settings.billingTenure,
    billingTenures,
    'billing tenure',
  )
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
  requireNonNegativeInteger(
    'settings.graceDays',
    form.settings.graceDays,
    'Grace days',
  )
  requireNonNegativeNumber(
    'settings.lateFeePerDay',
    form.settings.lateFeePerDay,
    'Late fee per day',
  )

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

const submitBankDetails = async () => {
  if (!validateBankDetailsForm()) {
    return
  }

  savingBankDetails.value = true

  try {
    const payload: Record<string, unknown> = {
      bankName: bankForm.bankName.trim(),
      accountName: bankForm.accountName.trim(),
      accountNumber: bankForm.accountNumber.trim(),
      ifscCode: bankForm.ifscCode.trim().toUpperCase(),
      accountType: bankForm.accountType,
      branchName: nullableText(bankForm.branchName),
      upiId: nullableText(bankForm.upiId),
      accountHeadId: bankForm.accountHeadId,
      isDefault: true,
      isActive: true,
    }

    if (societyPaymentAccount.value && !bankForm.accountNumber.trim()) {
      delete payload.accountNumber
    }

    if (societyPaymentAccount.value) {
      await api(
        `/api/admin/finance/bank-accounts/${societyPaymentAccount.value.id}`,
        {
          method: 'PATCH',
          body: payload,
        },
      )
    } else {
      await api('/api/admin/finance/bank-accounts', {
        method: 'POST',
        body: payload,
      })
    }

    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail:
        'Society bank details were saved for bills and payment collection.',
      life: 10000,
    })
    await refreshBankAccounts()
  } finally {
    savingBankDetails.value = false
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
            <InputText
              v-model="form.name"
              :invalid="Boolean(fieldError('name'))"
            />
            <small v-if="fieldError('name')" class="field-error">{{
              fieldError('name')
            }}</small>
          </label>
          <label>
            <span>Registration number</span>
            <InputText
              v-model="form.registrationNumber"
              maxlength="150"
              :invalid="Boolean(fieldError('registrationNumber'))"
            />
            <small
              v-if="fieldError('registrationNumber')"
              class="field-error"
              >{{ fieldError('registrationNumber') }}</small
            >
          </label>
          <label class="admin-form-grid__full">
            <span>Address line 1</span>
            <InputText
              v-model="form.addressLine1"
              :invalid="Boolean(fieldError('addressLine1'))"
            />
            <small v-if="fieldError('addressLine1')" class="field-error">{{
              fieldError('addressLine1')
            }}</small>
          </label>
          <label class="admin-form-grid__full">
            <span>Address line 2</span>
            <InputText
              v-model="form.addressLine2"
              maxlength="300"
              :invalid="Boolean(fieldError('addressLine2'))"
            />
            <small v-if="fieldError('addressLine2')" class="field-error">{{
              fieldError('addressLine2')
            }}</small>
          </label>
          <label>
            <span>City</span>
            <InputText
              v-model="form.city"
              :invalid="Boolean(fieldError('city'))"
            />
            <small v-if="fieldError('city')" class="field-error">{{
              fieldError('city')
            }}</small>
          </label>
          <label>
            <span>State</span>
            <InputText
              v-model="form.state"
              :invalid="Boolean(fieldError('state'))"
            />
            <small v-if="fieldError('state')" class="field-error">{{
              fieldError('state')
            }}</small>
          </label>
          <label>
            <span>Pincode</span>
            <InputText
              v-model="form.pincode"
              maxlength="30"
              :invalid="Boolean(fieldError('pincode'))"
            />
            <small v-if="fieldError('pincode')" class="field-error">{{
              fieldError('pincode')
            }}</small>
          </label>
          <label>
            <span>Timezone</span>
            <InputText
              v-model="form.timezone"
              :invalid="Boolean(fieldError('timezone'))"
            />
            <small v-if="fieldError('timezone')" class="field-error">{{
              fieldError('timezone')
            }}</small>
          </label>
          <label>
            <span>Contact email</span>
            <InputText
              v-model="form.contactEmail"
              type="email"
              maxlength="254"
              :invalid="Boolean(fieldError('contactEmail'))"
            />
            <small v-if="fieldError('contactEmail')" class="field-error">{{
              fieldError('contactEmail')
            }}</small>
          </label>
          <label>
            <span>Contact phone</span>
            <InputText
              v-model="form.contactPhone"
              maxlength="40"
              :invalid="Boolean(fieldError('contactPhone'))"
            />
            <small v-if="fieldError('contactPhone')" class="field-error">{{
              fieldError('contactPhone')
            }}</small>
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
            <small
              v-if="fieldError('settings.excessPaymentHandling')"
              class="field-error"
              >{{ fieldError('settings.excessPaymentHandling') }}</small
            >
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
            <small
              v-if="fieldError('settings.graceDays')"
              class="field-error"
              >{{ fieldError('settings.graceDays') }}</small
            >
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
            <small
              v-if="fieldError('settings.lateFeePerDay')"
              class="field-error"
              >{{ fieldError('settings.lateFeePerDay') }}</small
            >
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

    <form
      class="admin-form-layout"
      novalidate
      @submit.prevent="submitBankDetails"
    >
      <section class="surface-card admin-form-section">
        <div class="admin-form-section__header">
          <div>
            <p class="eyebrow">Payments</p>
            <h2>Society bank details</h2>
          </div>
          <div class="admin-inline-actions">
            <Button
              as="router-link"
              to="/admin/finance/accounts"
              type="button"
              label="All accounts"
              icon="pi pi-sitemap"
              severity="secondary"
              outlined
            />
            <Button
              type="submit"
              label="Save bank details"
              icon="pi pi-save"
              :loading="
                savingBankDetails || bankAccountsPending || accountsPending
              "
            />
          </div>
        </div>

        <div class="admin-form-grid">
          <label>
            <span>Bank</span>
            <InputText v-model="bankForm.bankName" required />
          </label>
          <label>
            <span>Account name</span>
            <InputText v-model="bankForm.accountName" required />
          </label>
          <label>
            <span>Account number</span>
            <InputText
              v-model="bankForm.accountNumber"
              :required="!societyPaymentAccount"
              :placeholder="
                societyPaymentAccount ? 'Leave blank to keep existing' : ''
              "
            />
          </label>
          <label>
            <span>IFSC</span>
            <InputText v-model="bankForm.ifscCode" required />
          </label>
          <label>
            <span>Account type</span>
            <Select
              v-model="bankForm.accountType"
              :options="bankAccountTypes"
              option-label="label"
              option-value="value"
            />
          </label>
          <label>
            <span>Mapped Asset account</span>
            <Select
              v-model="bankForm.accountHeadId"
              :options="assetAccountOptions"
              option-label="label"
              option-value="value"
              required
              placeholder="Choose Asset account"
            />
          </label>
          <label>
            <span>Branch</span>
            <InputText v-model="bankForm.branchName" />
          </label>
          <label>
            <span>UPI ID</span>
            <InputText v-model="bankForm.upiId" />
          </label>
          <div class="admin-form-grid__full society-payment-qr">
            <input
              ref="paymentQrInput"
              type="file"
              :accept="paymentQrAccept"
              class="society-payment-qr__input"
              @change="onPaymentQrChange"
            >
            <div class="society-payment-qr__summary">
              <div class="society-payment-qr__preview">
                <img
                  v-if="paymentQrImageUrl"
                  :src="paymentQrImageUrl"
                  alt="Payment QR code"
                >
                <i v-else class="pi pi-qrcode" aria-hidden="true" />
              </div>
              <div class="society-payment-qr__meta">
                <span class="field-label">Payment QR code</span>
                <strong>{{
                  paymentQrFile?.fileName ?? 'No QR uploaded'
                }}</strong>
                <small v-if="paymentQrFile">
                  {{ paymentQrFile.mimeType }} ·
                  {{ formatFileSize(paymentQrFile.sizeBytes) }}
                </small>
              </div>
            </div>
            <div class="admin-inline-actions society-payment-qr__actions">
              <Button
                type="button"
                icon="pi pi-upload"
                :label="paymentQrFile ? 'Replace QR' : 'Upload QR'"
                severity="secondary"
                outlined
                :loading="uploadingPaymentQr"
                :disabled="removingPaymentQr"
                @click="pickPaymentQr"
              />
              <Button
                v-if="paymentQrFile"
                type="button"
                icon="pi pi-trash"
                label="Remove"
                severity="danger"
                outlined
                :loading="removingPaymentQr"
                :disabled="uploadingPaymentQr"
                @click="removePaymentQr"
              />
            </div>
          </div>
        </div>
      </section>
    </form>
  </div>
</template>
