<script setup lang="ts">
const pushNotifications = usePushNotifications()
const toast = useToast()
const pushState = ref('idle')
const pushMessage = ref('')

const subscribePush = async () => {
  const result = await pushNotifications.subscribe({ requestPermission: true, showErrorToast: true })
  pushState.value = result.state
  pushMessage.value = result.message ?? ''

  if (result.state === 'subscribed') {
    toast.add({ severity: 'success', summary: 'Push enabled', detail: 'Push subscription refreshed for this device.', life: 10000 })
  }
}

definePageMeta({
  layout: 'service-staff',
  middleware: ['protected'],
  title: 'Notifications',
})
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Service notifications</h1>
          <p>Enable browser push to receive ticket updates while you work.</p>
        </div>
        <Button label="Enable push" icon="pi pi-bell" severity="secondary" outlined @click="subscribePush" />
      </header>

      <Message v-if="pushState === 'denied'" severity="warn">
        Notifications are blocked in this browser. Allow notifications from site settings, then try again.
      </Message>
      <Message v-else-if="pushState && pushState !== 'idle' && pushState !== 'subscribed'" severity="warn">
        {{ pushMessage || pushState }}
      </Message>
      <Message v-else-if="pushState === 'subscribed'" severity="success">
        Push subscription refreshed.
      </Message>
    </section>

    <AppNotificationInbox description="Ticket and assignment updates will appear here." />
  </div>
</template>
