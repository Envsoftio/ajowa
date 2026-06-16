<script setup lang="ts">
import type { ServiceRequestSummary } from '~/types/domain'

defineProps<{
  tickets: ServiceRequestSummary[]
  loading?: boolean
}>()

const emit = defineEmits<{
  open: [ticket: ServiceRequestSummary]
  assign: [ticket: ServiceRequestSummary]
  status: [ticket: ServiceRequestSummary]
}>()

const locationLabel = (ticket: ServiceRequestSummary) =>
  ticket.locationType === 'FLAT'
    ? ticket.flatLabel ?? 'Flat'
    : ticket.assetReference || ticket.areaName || ticket.locationType.replace('_', ' ')

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '-'
</script>

<template>
  <DataTable
    :value="tickets"
    :loading="loading"
    responsive-layout="scroll"
    class="list-page__table"
  >
    <Column field="requestNumber" header="Ticket" />
    <Column field="createdAt" header="Created">
      <template #body="{ data: row }">
        {{ formatDate(row.createdAt) }}
      </template>
    </Column>
    <Column header="Requester / Location">
      <template #body="{ data: row }">
        <div class="ticket-table-stack">
          <strong>{{ row.requesterName || row.sourceType.replace('_', ' ') }}</strong>
          <span>{{ locationLabel(row) }}</span>
        </div>
      </template>
    </Column>
    <Column field="title" header="Issue">
      <template #body="{ data: row }">
        <div class="ticket-table-stack">
          <strong>{{ row.title }}</strong>
          <span>{{ row.category }}</span>
        </div>
      </template>
    </Column>
    <Column header="Department">
      <template #body="{ data: row }">
        <div class="ticket-table-stack">
          <strong>{{ row.departmentName || 'Unassigned' }}</strong>
          <span>{{ row.assigneeName || 'Department queue' }}</span>
        </div>
      </template>
    </Column>
    <Column header="Priority">
      <template #body="{ data: row }">
        <PriorityTag :priority="row.priority" />
      </template>
    </Column>
    <Column header="Status">
      <template #body="{ data: row }">
        <TicketStatusTag :status="row.status" />
      </template>
    </Column>
    <Column header="SLA">
      <template #body="{ data: row }">
        <SlaBadge :due-by-at="row.dueByAt" :is-overdue="row.isOverdue" />
      </template>
    </Column>
    <Column header="Actions" style="width: 150px">
      <template #body="{ data: row }">
        <div class="admin-inline-actions">
          <Button icon="pi pi-eye" text rounded aria-label="Open ticket" @click="emit('open', row)" />
          <Button icon="pi pi-user-plus" text rounded severity="secondary" aria-label="Assign ticket" @click="emit('assign', row)" />
          <Button icon="pi pi-check-circle" text rounded severity="secondary" aria-label="Update status" @click="emit('status', row)" />
        </div>
      </template>
    </Column>
  </DataTable>
</template>

<style scoped>
.ticket-table-stack {
  display: grid;
  gap: 0.15rem;
}

.ticket-table-stack span {
  color: var(--color-muted);
  font-size: 0.85rem;
}
</style>
