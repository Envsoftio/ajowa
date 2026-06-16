<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Compose Notification',
})

const api = useApi()
const toast = useToast()
const confirmAction = useAppConfirm()
const saving = ref(false)
const form = reactive({
  title: '',
  body: '',
  category: 'NOTICES_ANNOUNCEMENTS',
  priority: 'MEDIUM',
  channels: ['IN_APP'] as string[],
  audienceScope: 'ALL_ACTIVE_RESIDENTS',
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

const submit = async () => {
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
        audience: { scope: form.audienceScope },
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
          <Select v-model="form.category" :options="['BILLING', 'PAYMENTS', 'ACCESS_QR', 'SERVICE_REQUESTS', 'NOTICES_ANNOUNCEMENTS', 'ACCOUNT_ONBOARDING', 'EMERGENCY_ALERTS']" />
          <Select v-model="form.priority" :options="['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']" />
          <Select v-model="form.audienceScope" :options="['ALL_ACTIVE_RESIDENTS', 'ACTIVE_PUSH_SUBSCRIBERS', 'OWNERS', 'TENANTS', 'DEFAULTERS', 'BILLING_CONTACTS']" />
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
