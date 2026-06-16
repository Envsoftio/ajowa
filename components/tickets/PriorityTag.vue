<script setup lang="ts">
import type { ServicePriority } from '~/types/domain'
import { getPrioritySeverity, priorityLabels } from '~/shared/service-requests'

defineProps<{
  priority: ServicePriority
}>()
</script>

<template>
  <Tag :severity="getPrioritySeverity(priority)" :value="priorityLabels[priority]" rounded />
</template>
