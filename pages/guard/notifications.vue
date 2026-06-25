<script setup lang="ts">
definePageMeta({
  layout: 'guard',
  middleware: ['protected'],
  title: 'Notifications',
})
</script>

<template>
  <div class="landing-page">
    <AppNotificationInbox description="Gate desk updates will appear here." />
  </div>
</template>
