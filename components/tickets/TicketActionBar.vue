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
      <Select v-model="selectedStatus" :options="statusOptions" placeholder="Status" />
      <Textarea v-model="comment" rows="2" auto-resize placeholder="Update note or resolution comment" />
      <InputText v-if="selectedStatus === 'REOPENED' || selectedStatus === 'NEEDS_REASSIGNMENT'" v-model="reason" placeholder="Reason" />
      <Button label="Apply" icon="pi pi-save" :loading="saving" @click="quickAction(selectedStatus)" />
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
  align-items: stretch;
}

.ticket-action-bar__form .p-textarea,
.ticket-action-bar__form .p-inputtext {
  min-width: min(100%, 18rem);
}
</style>
