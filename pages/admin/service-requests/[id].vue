<script setup lang="ts">
import type { ServiceDepartment, ServiceRequestDetail, ServiceRequestStatus } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Service Request',
})

type StaffOption = { id: string; fullName: string; email: string }

const route = useRoute()
const toast = useToast()
const serviceRequests = useServiceRequests('admin')
const saving = ref(false)
const assignDialogVisible = ref(false)

const { data, pending, refresh } = await useAsyncData(`admin-service-request-${route.params.id}`, () =>
  useApi()<{
    ok: true
    data: ServiceRequestDetail
  }>(`/api/admin/service-requests/${route.params.id}`),
)

const { data: optionsData } = await useAsyncData('admin-service-request-detail-options', () =>
  useApi()<{
    ok: true
    data: {
      departments: ServiceDepartment[]
      staff: StaffOption[]
    }
  }>('/api/service-requests/options'),
)

const ticket = computed(() => data.value?.data ?? null)
const departments = computed(() => optionsData.value?.data.departments ?? [])
const staff = computed(() => optionsData.value?.data.staff ?? [])

const assignTicket = async (payload: { departmentId: string; assigneeUserId?: string | null; reason?: string }) => {
  if (!ticket.value) {
    return
  }
  saving.value = true
  try {
    await serviceRequests.assignTicket(ticket.value.id, payload)
    toast.add({ severity: 'success', summary: 'Assigned', life: 10000 })
    assignDialogVisible.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

const addComment = async (payload: { visibility: 'INTERNAL_NOTE' | 'RESIDENT_VISIBLE' | 'SYSTEM'; commentBody: string }) => {
  saving.value = true
  try {
    await serviceRequests.addComment(String(route.params.id), payload)
    toast.add({ severity: 'success', summary: 'Comment added', life: 10000 })
    await refresh()
  } finally {
    saving.value = false
  }
}

const uploadAttachment = async (file: File) => {
  saving.value = true
  try {
    await serviceRequests.uploadAttachment(String(route.params.id), file)
    toast.add({ severity: 'success', summary: 'Attachment uploaded', life: 10000 })
    await refresh()
  } finally {
    saving.value = false
  }
}

const updateStatus = async (payload: { status: ServiceRequestStatus; comment?: string | null; reason?: string | null }) => {
  saving.value = true
  try {
    await serviceRequests.updateStatus(String(route.params.id), payload)
    toast.add({ severity: 'success', summary: 'Status updated', life: 10000 })
    await refresh()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="landing-page">
    <AppSkeletonState v-if="pending" />
    <template v-else-if="ticket">
      <section class="hero-panel dashboard-hero">
        <div>
          <p class="eyebrow">{{ ticket.requestNumber }}</p>
          <h1>{{ ticket.title }}</h1>
          <p>{{ ticket.description }}</p>
        </div>
        <div class="hero-actions">
          <PriorityTag :priority="ticket.priority" />
          <TicketStatusTag :status="ticket.status" />
          <SlaBadge :due-by-at="ticket.dueByAt" :is-overdue="ticket.isOverdue" />
          <Button label="Assign" icon="pi pi-user-plus" @click="assignDialogVisible = true" />
        </div>
      </section>

      <section class="admin-two-column--wide">
        <section class="surface-card">
          <div class="service-panel__header">
            <div>
              <p class="eyebrow">Summary</p>
              <h2>Ticket facts</h2>
            </div>
          </div>
          <TicketSummaryCard :ticket="ticket" compact />
          <div class="ticket-detail-facts">
            <div>
              <span>Requester</span>
              <strong>{{ ticket.requesterName || ticket.sourceType }}</strong>
            </div>
            <div>
              <span>Contact</span>
              <strong>{{ ticket.requesterMobileNumber || 'Policy hidden' }}</strong>
            </div>
            <div>
              <span>Location type</span>
              <strong>{{ ticket.locationType.replace('_', ' ') }}</strong>
            </div>
            <div>
              <span>Department</span>
              <strong>{{ ticket.departmentName || 'Unassigned' }}</strong>
            </div>
          </div>
          <TicketActionBar :ticket="ticket" mode="admin" :saving="saving" @status="updateStatus" />
        </section>

        <section class="surface-card">
          <div class="service-panel__header">
            <div>
              <p class="eyebrow">Assignment</p>
              <h2>Route work</h2>
            </div>
          </div>
          <DepartmentAssignPanel
            :ticket="ticket"
            :departments="departments"
            :staff-options="staff"
            :saving="saving"
            @assign="assignTicket"
          />
        </section>
      </section>

      <section class="admin-two-column--wide">
        <section class="surface-card">
          <div class="service-panel__header">
            <div>
              <p class="eyebrow">Timeline</p>
              <h2>Audit trail</h2>
            </div>
          </div>
          <TicketTimeline :events="ticket.events" :comments="ticket.comments" />
        </section>
        <section class="surface-card">
          <div class="service-panel__header">
            <div>
              <p class="eyebrow">Notes</p>
              <h2>Comments and proof</h2>
            </div>
          </div>
          <TicketCommentPanel :comments="ticket.comments" allow-internal :saving="saving" @add="addComment" />
          <TicketAttachmentGallery
            :attachments="ticket.attachments"
            can-upload
            :uploading="saving"
            @upload="uploadAttachment"
          />
        </section>
      </section>
    </template>

    <Dialog v-model:visible="assignDialogVisible" header="Assign ticket" modal :style="{ width: '720px', maxWidth: '95vw' }">
      <DepartmentAssignPanel
        :ticket="ticket"
        :departments="departments"
        :staff-options="staff"
        :saving="saving"
        @assign="assignTicket"
      />
    </Dialog>
  </div>
</template>

<style scoped>
.ticket-detail-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 1rem 0;
}

.ticket-detail-facts div {
  display: grid;
  gap: 0.15rem;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.ticket-detail-facts span {
  color: var(--color-muted);
  font-size: 0.85rem;
}
</style>
