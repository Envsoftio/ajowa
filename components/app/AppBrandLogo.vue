<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
    variant?: 'full' | 'mark'
  }>(),
  {
    label: 'AJOWA',
    variant: 'full',
  },
)
</script>

<template>
  <span class="app-brand-logo" :data-variant="variant" role="img" :aria-label="label">
    <img src="/ajowa-logo.svg" alt="" aria-hidden="true">
  </span>
</template>
