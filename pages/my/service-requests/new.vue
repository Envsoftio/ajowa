<script setup lang="ts">
import type { ServiceDepartment } from '~/types/domain'
import type { ServiceRequestCreatePayload } from '~/composables/useServiceRequests'

definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'Raise Service Request',
})

const api = useApi()
const toast = useToast()
const router = useRouter()
const serviceRequests = useServiceRequests('resident')
const saving = ref(false)
const createdTicket = ref<{ id: string; requestNumber: string } | null>(null)
const createIdempotencyKey = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
const pendingIdempotencyKey = ref(createIdempotencyKey())

const { data } = await useAsyncData('service-request-options-resident', () =>
  api<{
    ok: true
    data: {
      flats: Array<{ id: string; label: string }>
      departments: ServiceDepartment[]
      staff: Array<{ id: string; fullName: string; email: string }>
    }
  }>('/api/service-requests/options'),
)

const submit = async (payload: ServiceRequestCreatePayload) => {
  if (saving.value) {
    return
  }

  saving.value = true

  try {
    const response = await serviceRequests.createTicket({
      ...payload,
      idempotencyKey: pendingIdempotencyKey.value,
    })
    createdTicket.value = response.data
    pendingIdempotencyKey.value = createIdempotencyKey()
    toast.add({ severity: 'success', summary: 'Ticket created', detail: response.data.requestNumber, life: 10000 })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="landing-page">
    <section class="hero-panel">
      <Tag severity="info" value="Service Request" rounded />
      <h1>Raise Complaint / Service Request</h1>
      <p>Share the issue, location, priority, and preferred visit time so the operations team can route it quickly.</p>
    </section>

    <section v-if="createdTicket" class="surface-card ticket-success">
      <Tag severity="success" value="Created" rounded />
      <h2>{{ createdTicket.requestNumber }}</h2>
      <p>Your request is open. The team will review the route and update the timeline.</p>
      <div class="admin-inline-actions">
        <Button label="View ticket" icon="pi pi-eye" @click="router.push(`/my/service-requests/${createdTicket?.id}`)" />
        <Button label="View my tickets" icon="pi pi-list" severity="secondary" outlined @click="router.push('/my/service-requests')" />
      </div>
    </section>

    <section v-else class="surface-card">
      <TicketForm
        :flat-options="data?.data.flats ?? []"
        :saving="saving"
        @submit="submit"
      />
    </section>
  </div>
</template>

<style scoped>
.ticket-success {
  display: grid;
  gap: 0.75rem;
}

.ticket-success h2,
.ticket-success p {
  margin: 0;
}
</style>
