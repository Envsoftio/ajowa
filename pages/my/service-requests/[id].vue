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

const ticket = computed(() => data.value?.data ?? null)

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
    toast.add({ severity: 'success', summary: 'Ticket reopened', life: 10000 })
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
              <p class="eyebrow">Timeline</p>
              <h2>Request history</h2>
            </div>
          </div>
          <TicketTimeline :events="ticket.events" :comments="ticket.comments" />
        </section>
        <section class="surface-card">
          <div class="service-panel__header">
            <div>
              <p class="eyebrow">Comments</p>
              <h2>Updates</h2>
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
      </section>
    </template>
  </div>
</template>
