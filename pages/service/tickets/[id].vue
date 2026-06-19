<script setup lang="ts">
import type { ServiceRequestDetail, ServiceRequestStatus } from '~/types/domain'

definePageMeta({
  layout: 'service-staff',
  middleware: ['protected'],
  title: 'Service Ticket',
})

const route = useRoute()
const toast = useToast()
const serviceRequests = useServiceRequests('service')
const saving = ref(false)

const { data, pending, refresh } = await useAsyncData(`service-ticket-${route.params.id}`, () =>
  useApi()<{
    ok: true
    data: ServiceRequestDetail
  }>(`/api/service/tickets/${route.params.id}`),
)

const ticket = computed(() => data.value?.data ?? null)

const updateStatus = async (payload: { status: ServiceRequestStatus; comment?: string | null; reason?: string | null }) => {
  saving.value = true
  try {
    await serviceRequests.updateStatus(String(route.params.id), payload)
    toast.add({ severity: 'success', summary: 'Ticket updated', life: 10000 })
    await refresh()
  } finally {
    saving.value = false
  }
}

const addComment = async (payload: { visibility: 'INTERNAL_NOTE' | 'RESIDENT_VISIBLE' | 'SYSTEM'; commentBody: string }) => {
  saving.value = true
  try {
    await serviceRequests.addComment(String(route.params.id), payload)
    toast.add({ severity: 'success', summary: 'Work note added', life: 10000 })
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
</script>

<template>
  <div class="landing-page">
    <AppSkeletonState v-if="pending" />
    <template v-else-if="ticket">
      <TicketSummaryCard :ticket="ticket" />
      <section class="admin-two-column--wide">
        <section class="surface-card">
          <div class="service-panel__header">
            <div>
              <p class="eyebrow">Work actions</p>
              <h2>Update progress</h2>
            </div>
          </div>
          <TicketActionBar :ticket="ticket" mode="service" :saving="saving" @status="updateStatus" />
          <div class="ticket-contact-strip">
            <div>
              <span>Location</span>
              <strong>{{ ticket.flatLabel || ticket.areaName || ticket.assetReference || ticket.locationType }}</strong>
            </div>
            <div>
              <span>Contact</span>
              <strong>{{ ticket.requesterMobileNumber || 'Hidden by policy' }}</strong>
            </div>
          </div>
        </section>
        <section class="surface-card">
          <div class="service-panel__header">
            <div>
              <p class="eyebrow">Notes</p>
              <h2>Work log</h2>
            </div>
          </div>
          <TicketCommentPanel :comments="ticket.comments" allow-internal :saving="saving" @add="addComment" />
        </section>
      </section>

      <section class="admin-two-column--wide">
        <section class="surface-card">
          <div class="service-panel__header">
            <div>
              <p class="eyebrow">Timeline</p>
              <h2>Ticket history</h2>
            </div>
          </div>
          <TicketTimeline :events="ticket.events" :comments="ticket.comments" />
        </section>
        <section class="surface-card">
          <div class="service-panel__header">
            <div>
              <p class="eyebrow">Evidence</p>
              <h2>Attachments</h2>
            </div>
          </div>
          <TicketAttachmentGallery
            :attachments="ticket.attachments"
            can-upload
            :uploading="saving"
            @upload="uploadAttachment"
          />
        </section>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ticket-contact-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}

.ticket-contact-strip div {
  display: grid;
  gap: 0.15rem;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.ticket-contact-strip span {
  color: var(--color-muted);
  font-size: 0.85rem;
}
</style>
