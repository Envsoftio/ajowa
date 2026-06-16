<script setup lang="ts">
import type { ServiceRequestStatus } from '~/types/domain'
import { getStatusSeverity, statusLabels } from '~/shared/service-requests'

defineProps<{
  status: ServiceRequestStatus
}>()
</script>

<template>
  <Tag :severity="getStatusSeverity(status)" :value="statusLabels[status]" rounded />
</template>
