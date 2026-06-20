<script setup lang="ts">
definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'Notification Settings',
})

type Preference = {
  category: string
  pushEnabled: boolean
  emailEnabled: boolean
  whatsappEnabled: boolean
  inAppEnabled: boolean
  quietHoursStart: string | null
  quietHoursEnd: string | null
  fallbackToMobileForWhatsapp: boolean
  preferredLanguage: string
  allowCriticalBypass: boolean
}

const api = useApi()
const toast = useToast()
const runtimeConfig = useRuntimeConfig()
const preferences = ref<Preference[]>([])
const subscriptions = ref<{ id: string; deviceLabel: string | null; status: string; lastSeenAt: string | null }[]>([])
const pushState = ref('idle')
const saving = ref(false)

const load = async () => {
  const response = await api<{ ok: true; data: { preferences: Preference[]; subscriptions: typeof subscriptions.value } }>('/api/my/settings/notifications')
  preferences.value = response.data.preferences
  subscriptions.value = response.data.subscriptions
}

await useAsyncData('my-notification-settings', load)

const save = async () => {
  saving.value = true
  try {
    await api('/api/my/settings/notifications', { method: 'PUT', body: { preferences: preferences.value } })
    toast.add({ severity: 'success', summary: 'Settings saved', life: 10000 })
  } finally {
    saving.value = false
  }
}

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

const subscribePush = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    pushState.value = 'unsupported'
    return
  }

  const keyResponse = await api<{ ok: true; data: { enabled: boolean; publicKey: string | null; reason: string | null } }>('/api/notifications/push/public-key')
  if (!keyResponse.data.enabled || !keyResponse.data.publicKey) {
    pushState.value = keyResponse.data.reason ?? 'Push is not configured.'
    return
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    pushState.value = 'denied'
    return
  }

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyResponse.data.publicKey),
  })
  await api('/api/my/notifications/push/subscribe', {
    method: 'POST',
    body: {
      ...subscription.toJSON(),
      deviceLabel: navigator.platform || runtimeConfig.public.appName,
      platform: navigator.platform,
    },
  })
  pushState.value = 'subscribed'
  await load()
}
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Notification settings</h1>
          <p>Choose channels by category and keep browser push current.</p>
        </div>
        <div class="list-page__exports">
          <Button label="Enable push" icon="pi pi-bell" severity="secondary" outlined @click="subscribePush" />
          <Button label="Save" icon="pi pi-save" :loading="saving" @click="save" />
        </div>
      </header>

      <Message v-if="pushState && pushState !== 'idle' && pushState !== 'subscribed'" severity="warn">{{ pushState }}</Message>
      <Message v-if="pushState === 'subscribed'" severity="success">Push subscription refreshed.</Message>

      <AppDataTable :value="preferences" responsive-layout="scroll" class="list-page__table">
        <Column field="category" header="Category" />
        <Column header="Push"><template #body="{ data: row }"><ToggleSwitch v-model="row.pushEnabled" /></template></Column>
        <Column header="Email"><template #body="{ data: row }"><ToggleSwitch v-model="row.emailEnabled" /></template></Column>
        <Column header="WhatsApp"><template #body="{ data: row }"><ToggleSwitch v-model="row.whatsappEnabled" /></template></Column>
        <Column header="In-app"><template #body="{ data: row }"><ToggleSwitch v-model="row.inAppEnabled" /></template></Column>
        <Column header="Quiet hours">
          <template #body="{ data: row }">
            <div class="admin-inline-actions">
              <InputText v-model="row.quietHoursStart" placeholder="22:00" />
              <InputText v-model="row.quietHoursEnd" placeholder="07:00" />
            </div>
          </template>
        </Column>
        <Column header="Mobile fallback"><template #body="{ data: row }"><ToggleSwitch v-model="row.fallbackToMobileForWhatsapp" /></template></Column>
      </AppDataTable>
    </section>
  </div>
</template>
