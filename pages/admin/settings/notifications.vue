<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Notification Settings',
})

type Setting = {
  eventKey: string
  category: string
  pushEnabled: boolean
  emailEnabled: boolean
  whatsappEnabled: boolean
  inAppEnabled: boolean
  recipientScope: string | null
  cooldownMinutes: number
  priority: string
  channelPauseUntil: string | null
  quietHoursStart: string | null
  quietHoursEnd: string | null
  senderName: string | null
  throttlePerHour: number
  retryMaxAttempts: number
  managerBroadcastScope: string
  criticalBypassQuietHours: boolean
}

const api = useApi()
const toast = useToast()
const settings = ref<Setting[]>([])
const providers = ref<Record<string, { enabled: boolean; reason: string | null }>>({})
const metrics = ref({ activePushSubscribers: 0, activeResidents: 0 })
const test = reactive({ channel: 'EMAIL', target: '' })
const saving = ref(false)

const load = async () => {
  const response = await api<{ ok: true; data: { settings: Setting[]; providers: typeof providers.value; metrics: typeof metrics.value } }>('/api/admin/settings/notifications')
  settings.value = response.data.settings.length
    ? response.data.settings
    : [
        { eventKey: 'manual.broadcast', category: 'NOTICES_ANNOUNCEMENTS', pushEnabled: true, emailEnabled: true, whatsappEnabled: false, inAppEnabled: true, recipientScope: 'ALL_ACTIVE_RESIDENTS', cooldownMinutes: 0, priority: 'MEDIUM', channelPauseUntil: null, quietHoursStart: null, quietHoursEnd: null, senderName: 'AJOWA', throttlePerHour: 0, retryMaxAttempts: 3, managerBroadcastScope: 'ALL_ACTIVE_RESIDENTS', criticalBypassQuietHours: true },
        { eventKey: 'notice.published', category: 'NOTICES_ANNOUNCEMENTS', pushEnabled: true, emailEnabled: true, whatsappEnabled: true, inAppEnabled: true, recipientScope: 'ALL_ACTIVE_RESIDENTS', cooldownMinutes: 0, priority: 'MEDIUM', channelPauseUntil: null, quietHoursStart: null, quietHoursEnd: null, senderName: 'AJOWA', throttlePerHour: 0, retryMaxAttempts: 3, managerBroadcastScope: 'ALL_ACTIVE_RESIDENTS', criticalBypassQuietHours: true },
      ]
  providers.value = response.data.providers
  metrics.value = response.data.metrics
}

await useAsyncData('admin-notification-settings', load)

const save = async () => {
  saving.value = true
  try {
    await api('/api/admin/settings/notifications', { method: 'PUT', body: { settings: settings.value } })
    toast.add({ severity: 'success', summary: 'Settings saved', life: 10000 })
    await load()
  } finally {
    saving.value = false
  }
}

const verify = async () => {
  const response = await api<{ ok: true; data: { ok: boolean; reason: string | null } }>('/api/admin/settings/notifications/verify', {
    method: 'POST',
    body: test,
  })
  toast.add({
    severity: response.data.ok ? 'success' : 'warn',
    summary: response.data.ok ? 'Verification sent' : 'Verification failed',
    detail: response.data.reason ?? undefined,
    life: 10000,
  })
}
</script>

<template>
  <div class="landing-page">
    <div class="surface-grid">
      <section v-for="(provider, name) in providers" :key="name" class="surface-card">
        <p class="eyebrow">{{ name }}</p>
        <h3>{{ provider.enabled ? 'Enabled' : 'Disabled' }}</h3>
        <p>{{ provider.reason || 'Provider is configured.' }}</p>
      </section>
    </div>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Notification settings</h1>
          <p>{{ metrics.activeResidents }} active residents and {{ metrics.activePushSubscribers }} push subscribers.</p>
        </div>
        <Button label="Save" icon="pi pi-save" :loading="saving" @click="save" />
      </header>

      <DataTable :value="settings" responsive-layout="scroll" class="list-page__table">
        <Column field="eventKey" header="Event"><template #body="{ data: row }"><InputText v-model="row.eventKey" /></template></Column>
        <Column field="category" header="Category"><template #body="{ data: row }"><Select v-model="row.category" :options="['BILLING', 'PAYMENTS', 'ACCESS_QR', 'SERVICE_REQUESTS', 'NOTICES_ANNOUNCEMENTS', 'ACCOUNT_ONBOARDING', 'EMERGENCY_ALERTS']" /></template></Column>
        <Column header="Push"><template #body="{ data: row }"><ToggleSwitch v-model="row.pushEnabled" /></template></Column>
        <Column header="Email"><template #body="{ data: row }"><ToggleSwitch v-model="row.emailEnabled" /></template></Column>
        <Column header="WhatsApp"><template #body="{ data: row }"><ToggleSwitch v-model="row.whatsappEnabled" /></template></Column>
        <Column header="In-app"><template #body="{ data: row }"><ToggleSwitch v-model="row.inAppEnabled" /></template></Column>
        <Column field="retryMaxAttempts" header="Retries"><template #body="{ data: row }"><InputNumber v-model="row.retryMaxAttempts" :min="1" :max="10" /></template></Column>
      </DataTable>

      <div class="admin-form-layout">
        <h2>Provider verification</h2>
        <div class="surface-grid">
          <Select v-model="test.channel" :options="['EMAIL', 'WHATSAPP', 'PUSH']" />
          <InputText v-model="test.target" placeholder="Email, WhatsApp number, or current user push" />
          <Button label="Send test" icon="pi pi-send" severity="secondary" outlined @click="verify" />
        </div>
      </div>
    </section>
  </div>
</template>
