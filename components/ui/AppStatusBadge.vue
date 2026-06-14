<script setup lang="ts">
import { getStatusConfig } from '~/shared/status'

const props = defineProps<{
  status: string
}>()

const config = computed(() => getStatusConfig(props.status))
</script>

<template>
  <Tag
    :value="config.label"
    :severity="config.severity"
    rounded
    :class="['app-status-badge', `app-status-badge--${config.tone}`]"
  />
</template>
