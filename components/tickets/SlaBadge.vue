<script setup lang="ts">
import { formatSlaLabel } from '~/shared/service-requests'

const props = defineProps<{
  dueByAt?: string | null
  isOverdue?: boolean
}>()

const label = computed(() => formatSlaLabel(props.dueByAt, props.isOverdue))
const severity = computed(() => props.isOverdue ? 'danger' : props.dueByAt ? 'info' : 'secondary')
</script>

<template>
  <Tag :severity="severity" :value="label" rounded />
</template>
