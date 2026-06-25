<script setup lang="ts">
definePageMeta({
  layout: 'service-staff',
  middleware: ['protected'],
  title: 'Notifications',
})
</script>

<template>
  <div class="landing-page">
    <AppNotificationInbox description="Ticket and assignment updates will appear here." />
  </div>
</template>
