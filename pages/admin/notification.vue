<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Notifications',
})

await navigateTo('/admin/notifications', { replace: true })
</script>

<template>
  <div />
</template>
