<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'My Notifications',
})
</script>

<template>
  <div class="landing-page">
    <AppNotificationInbox
      title="My notifications"
      description="Personal admin updates will appear here."
    />
  </div>
</template>
