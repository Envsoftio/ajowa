<script setup lang="ts">
import type { ServiceRequestStatus, ServiceRequestSummary } from '~/types/domain'

const props = defineProps<{
  ticket: ServiceRequestSummary
  mode: 'admin' | 'resident' | 'service'
  saving?: boolean
}>()

const emit = defineEmits<{
  status: [payload: { status: ServiceRequestStatus; comment?: string | null; reason?: string | null }]
}>()

const selectedStatus = ref<ServiceRequestStatus>('IN_PROGRESS')
const comment = ref('')
const reason = ref('')

const statusOptions = computed<ServiceRequestStatus[]>(() => {
  if (props.mode === 'resident') {
    return props.ticket.status === 'RESOLVED' || props.ticket.status === 'CLOSED' ? ['REOPENED'] : []
  }
  if (props.mode === 'service') {
    return ['ACKNOWLEDGED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'NEEDS_REASSIGNMENT']
  }
  return ['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED']
})

watch(statusOptions, (options) => {
  if (options[0]) {
    selectedStatus.value = options[0]
  }
}, { immediate: true })

const quickAction = (status: ServiceRequestStatus) => {
  emit('status', { status, comment: comment.value || null, reason: reason.value || null })
  comment.value = ''
  reason.value = ''
}
</script>

<template>
  <section class="ticket-action-bar">
    <div class="ticket-action-bar__quick">
      <Button
        v-if="statusOptions.includes('ACKNOWLEDGED')"
        label="Acknowledge"
        icon="pi pi-check"
        severity="secondary"
        outlined
        :loading="saving"
        @click="quickAction('ACKNOWLEDGED')"
      />
      <Button
        v-if="statusOptions.includes('IN_PROGRESS')"
        label="Start"
        icon="pi pi-play"
        :loading="saving"
        @click="quickAction('IN_PROGRESS')"
      />
      <Button
        v-if="statusOptions.includes('RESOLVED')"
        label="Resolve"
        icon="pi pi-verified"
        severity="success"
        outlined
        :loading="saving"
        @click="quickAction('RESOLVED')"
      />
    </div>
    <div class="ticket-action-bar__form">
      <Select v-model="selectedStatus" class="ticket-action-bar__status" :options="statusOptions" placeholder="Status" />
      <Textarea v-model="comment" class="ticket-action-bar__note" rows="1" auto-resize placeholder="Update note or resolution comment" />
      <InputText
        v-if="selectedStatus === 'REOPENED' || selectedStatus === 'NEEDS_REASSIGNMENT'"
        v-model="reason"
        class="ticket-action-bar__reason"
        placeholder="Reason"
      />
      <Button class="ticket-action-bar__apply" label="Apply" icon="pi pi-save" :loading="saving" @click="quickAction(selectedStatus)" />
    </div>
  </section>
</template>

<style scoped>
.ticket-action-bar {
  display: grid;
  gap: 0.85rem;
}

.ticket-action-bar__quick,
.ticket-action-bar__form {
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
  align-items: center;
}

.ticket-action-bar__form {
  align-items: flex-start;
}

.ticket-action-bar__status {
  flex: 0 1 11rem;
}

.ticket-action-bar__note {
  flex: 1 1 18rem;
  line-height: 1.35;
  resize: vertical;
}

.ticket-action-bar__reason {
  flex: 1 1 14rem;
}

.ticket-action-bar__apply {
  flex: 0 0 auto;
}

.ticket-action-bar__status,
.ticket-action-bar__note,
.ticket-action-bar__reason,
.ticket-action-bar__apply {
  min-height: 2.6rem;
}

.ticket-action-bar__status :deep(.p-select-label) {
  display: flex;
  align-items: center;
  padding-block: 0.55rem;
}

@media (max-width: 640px) {
  .ticket-action-bar__status,
  .ticket-action-bar__note,
  .ticket-action-bar__reason,
  .ticket-action-bar__apply {
    flex-basis: 100%;
    width: 100%;
  }
}
</style>
