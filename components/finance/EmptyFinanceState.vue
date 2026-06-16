<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    message?: string
  }>(),
  {
    title: 'No finance records found',
    message: 'Adjust filters or add a transaction to get started.',
  },
)
</script>

<template>
  <AppState variant="empty" :title="title" :message="message" />
</template>
