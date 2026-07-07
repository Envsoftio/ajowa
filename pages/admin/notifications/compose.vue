<script setup lang="ts">
import type { PaginatedResponse } from '~/types/api'
import type { FlatSummary } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Compose Notification',
})

type AudienceScope =
  | 'ALL_ACTIVE_RESIDENTS'
  | 'ACTIVE_PUSH_SUBSCRIBERS'
  | 'OWNERS'
  | 'OWNER_OF_FLAT'
  | 'TENANTS'
  | 'DEFAULTERS'
  | 'BILLING_CONTACTS'

const api = useApi()
const toast = useToast()
const confirmAction = useAppConfirm()
const saving = ref(false)
const flatOwnerScope = 'OWNER_OF_FLAT' as const
const form = reactive({
  title: '',
  body: '',
  category: 'NOTICES_ANNOUNCEMENTS',
  priority: 'MEDIUM',
  channels: ['IN_APP'] as string[],
  audienceScope: 'ALL_ACTIVE_RESIDENTS' as AudienceScope,
  flatId: null as string | null,
  scheduleFor: '',
  draft: false,
  attachmentReference: '',
})

const channelOptions = [
  { label: 'Push', value: 'PUSH' },
  { label: 'Email', value: 'EMAIL' },
  { label: 'WhatsApp', value: 'WHATSAPP' },
  { label: 'In-app', value: 'IN_APP' },
]

const audienceOptions = [
  { label: 'All active residents', value: 'ALL_ACTIVE_RESIDENTS' },
  { label: 'Active push subscribers', value: 'ACTIVE_PUSH_SUBSCRIBERS' },
  { label: 'All owners', value: 'OWNERS' },
  { label: 'Single flat owner', value: flatOwnerScope },
  { label: 'All tenants', value: 'TENANTS' },
  { label: 'Defaulters', value: 'DEFAULTERS' },
  { label: 'Billing contacts', value: 'BILLING_CONTACTS' },
] satisfies { label: string; value: AudienceScope }[]

const { data: flatsData } = await useAsyncData('notification-flat-owner-options', () =>
  api<PaginatedResponse<FlatSummary>>('/api/admin/flats', {
    query: {
      page: 1,
      pageSize: 2000,
      sortBy: 'flatNumber',
      sortDirection: 'asc',
      'filters[isActive]': 'true',
    },
  }),
)

const flatOptions = computed(() =>
  (flatsData.value?.data.items ?? []).map((flat) => {
    const ownerCount = typeof flat.ownerCount === 'number' ? ` · ${flat.ownerCount} owner${flat.ownerCount === 1 ? '' : 's'}` : ''
    return {
      label: `${flat.blockName} ${flat.flatNumber}${ownerCount}`,
      value: flat.id,
    }
  }),
)

watch(() => form.audienceScope, (scope) => {
  if (scope !== flatOwnerScope) {
    form.flatId = null
  }
})

const buildAudience = () => {
  if (form.audienceScope === flatOwnerScope) {
    return { scope: form.audienceScope, flatIds: form.flatId ? [form.flatId] : [] }
  }
  return { scope: form.audienceScope }
}

const submit = async () => {
  if (form.audienceScope === flatOwnerScope && !form.flatId) {
    toast.add({
      severity: 'warn',
      summary: 'Select a flat',
      detail: 'Choose the flat whose owner should receive this notification.',
      life: 10000,
    })
    return
  }

  if (!form.draft) {
    const confirmed = await confirmAction({
      header: 'Queue notification?',
      message: 'Queue this notification for the selected audience and channels?',
      icon: 'pi pi-send',
      acceptLabel: 'Queue notification',
      acceptSeverity: 'warn',
    })

    if (!confirmed) {
      return
    }
  }

  saving.value = true
  try {
    const response = await api<{ ok: true; data: { eventId: string | null; audienceCount: number; jobCount: number } }>('/api/admin/notifications/compose', {
      method: 'POST',
      body: {
        title: form.title,
        body: form.body,
        category: form.category,
        priority: form.priority,
        channels: form.channels,
        audience: buildAudience(),
        scheduleFor: form.scheduleFor ? new Date(form.scheduleFor).toISOString() : null,
        draft: form.draft,
        attachmentReference: form.attachmentReference || null,
      },
    })
    toast.add({
      severity: 'success',
      summary: form.draft ? 'Draft saved' : 'Notification queued',
      detail: `${response.data.audienceCount} recipients resolved and ${response.data.jobCount} jobs queued.`,
      life: 10000,
    })
    await navigateTo('/admin/notifications')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Compose notification</h1>
          <p>Send or schedule a multi-channel resident broadcast.</p>
        </div>
      </header>

      <form class="admin-form-layout" @submit.prevent="submit">
        <InputText v-model="form.title" placeholder="Title" />
        <Textarea v-model="form.body" rows="8" placeholder="Message" />
        <div class="surface-grid">
          <Select v-model="form.category" :options="['BILLING', 'PAYMENTS', 'ACCESS_QR', 'SERVICE_REQUESTS', 'AMENITY_BOOKINGS', 'NOTICES_ANNOUNCEMENTS', 'ACCOUNT_ONBOARDING', 'EMERGENCY_ALERTS']" />
          <Select v-model="form.priority" :options="['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']" />
          <Select v-model="form.audienceScope" :options="audienceOptions" option-label="label" option-value="value" />
          <Select
            v-if="form.audienceScope === flatOwnerScope"
            v-model="form.flatId"
            :options="flatOptions"
            option-label="label"
            option-value="value"
            filter
            placeholder="Select flat owner"
          />
        </div>
        <MultiSelect v-model="form.channels" :options="channelOptions" option-label="label" option-value="value" display="chip" />
        <InputText v-model="form.scheduleFor" placeholder="Schedule date/time, optional" />
        <InputText v-model="form.attachmentReference" placeholder="Attachment reference, optional" />
        <div class="admin-inline-actions">
          <ToggleSwitch v-model="form.draft" />
          <span>Save as draft</span>
        </div>
        <div class="list-page__exports">
          <Button label="Queue notification" icon="pi pi-send" :loading="saving" type="submit" />
        </div>
      </form>
    </section>
  </div>
</template>
