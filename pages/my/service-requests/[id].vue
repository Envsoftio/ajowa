<script setup lang="ts">
import type { ServiceRequestDetail, ServiceRequestStatus } from '~/types/domain'

definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'Service Request Detail',
})

const route = useRoute()
const toast = useToast()
const serviceRequests = useServiceRequests('resident')
const saving = ref(false)

const { data, pending, refresh } = await useAsyncData(`my-service-request-${route.params.id}`, () =>
  useApi()<{
    ok: true
    data: ServiceRequestDetail
  }>(`/api/my/service-requests/${route.params.id}`),
)

const ticketState = shallowRef<ServiceRequestDetail | null>(data.value?.data ?? null)
watch(data, (value) => {
  if (value?.data) {
    ticketState.value = value.data
  }
}, { immediate: true })
const ticket = computed(() => ticketState.value)

const addComment = async (payload: { visibility: 'RESIDENT_VISIBLE' | 'INTERNAL_NOTE' | 'SYSTEM'; commentBody: string }) => {
  saving.value = true
  try {
    await serviceRequests.addComment(String(route.params.id), payload)
    toast.add({ severity: 'success', summary: 'Update added', life: 10000 })
    await refresh()
  } finally {
    saving.value = false
  }
}

const uploadAttachment = async (files: File[]) => {
  saving.value = true
  try {
    for (const file of files) {
      await serviceRequests.uploadAttachment(String(route.params.id), file)
    }
    toast.add({
      severity: 'success',
      summary: files.length === 1 ? 'Attachment uploaded' : 'Attachments uploaded',
      detail: files.length === 1 ? files[0]?.name : `${files.length} files uploaded successfully.`,
      life: 10000,
    })
    await refresh()
  } finally {
    saving.value = false
  }
}

const updateStatus = async (payload: { status: ServiceRequestStatus; comment?: string | null; reason?: string | null }) => {
  saving.value = true
  try {
    await serviceRequests.updateStatus(String(route.params.id), payload)
    toast.add({ severity: 'success', summary: 'Ticket reopened', life: 10000 })
    await refresh()
  } finally {
    saving.value = false
  }
}

const showTimeline = ref(false)
const timelineCount = computed(() =>
  (ticket.value?.events.length ?? 0) + (ticket.value?.comments.length ?? 0),
)
</script>

<template>
  <div class="landing-page">
    <AppSkeletonState v-if="pending && !ticket" />
    <template v-else-if="ticket">
      <TicketSummaryCard :ticket="ticket" />
      <section class="admin-two-column--wide">
        <section class="surface-card">
          <div class="service-panel__header">
            <div>
              <p class="eyebrow">Comments</p>
              <h2>Updates and notes</h2>
            </div>
          </div>
          <TicketActionBar
            v-if="ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'"
            :ticket="ticket"
            mode="resident"
            :saving="saving"
            @status="updateStatus"
          />
          <TicketCommentPanel :comments="ticket.comments" :saving="saving" @add="addComment" />
          <TicketAttachmentGallery
            :attachments="ticket.attachments"
            can-upload
            :uploading="saving"
            @upload="uploadAttachment"
          />
        </section>
        <section class="surface-card">
          <div class="service-panel__header">
            <div>
              <p class="eyebrow">Timeline</p>
              <h2>Request history</h2>
            </div>
            <Button
              :label="showTimeline ? 'Hide history' : 'Show history'"
              :icon="showTimeline ? 'pi pi-angle-up' : 'pi pi-angle-down'"
              severity="secondary"
              text
              size="small"
              @click="showTimeline = !showTimeline"
              :aria-expanded="showTimeline"
            />
          </div>
          <p v-if="!showTimeline && timelineCount > 0" class="service-request-detail__timeline-hint">
            {{ timelineCount }} timeline {{ timelineCount === 1 ? 'entry' : 'entries' }} available.
          </p>
          <TicketTimeline v-if="showTimeline" :events="ticket.events" :comments="ticket.comments" />
          <AppState
            v-if="timelineCount === 0"
            variant="empty"
            title="No timeline yet"
            message="Ticket activity will appear here."
          />
        </section>
      </section>
    </template>
  </div>
</template>

<style scoped>
.service-panel__header {
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.service-panel__header,
.service-panel__header > div {
  display: flex;
  flex-wrap: wrap;
}

.service-panel__header > div {
  flex: 1;
  min-width: 0;
  gap: 0.25rem;
  display: grid;
  align-content: start;
}

.service-request-detail__timeline-hint {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.9rem;
}
</style>
