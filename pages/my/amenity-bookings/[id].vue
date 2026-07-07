<script setup lang="ts">
import type { AmenityBookingDetail } from '~/types/domain'
import {
  amenityBookingStatusLabels,
  amenityBookingStatusSeverity,
} from '~/shared/amenity-bookings'

definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'Booking Detail',
})

const api = useApi()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const cancelDialogVisible = ref(false)
const cancelReason = ref('')
const saving = ref(false)

const bookingId = computed(() => String(route.params.id))

const { data, pending, refresh } = await useAsyncData(`my-amenity-booking-${bookingId.value}`, () =>
  api<{ ok: true; data: AmenityBookingDetail }>(`/api/my/amenity-bookings/${bookingId.value}`),
)

const booking = computed(() => data.value?.data ?? null)
const canCancel = computed(() => ['REQUESTED', 'APPROVED'].includes(booking.value?.status ?? ''))

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '-'

const cancelBooking = async () => {
  if (!booking.value || saving.value) return

  saving.value = true
  try {
    await api(`/api/my/amenity-bookings/${booking.value.id}/cancel`, {
      method: 'POST',
      body: { reason: cancelReason.value || null },
    })
    toast.add({ severity: 'success', summary: 'Booking cancelled', life: 10000 })
    cancelDialogVisible.value = false
    cancelReason.value = ''
    await refresh()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="landing-page">
    <AppState v-if="pending" variant="loading" title="Loading booking" message="Fetching booking details." />
    <template v-else-if="booking">
      <section class="list-page surface-card">
        <header class="list-page__header">
          <div>
            <h1>{{ booking.bookingNumber }}</h1>
            <p>{{ booking.amenityName }} · {{ booking.flatLabel }}</p>
          </div>
          <div class="list-page__exports">
            <Tag :severity="amenityBookingStatusSeverity(booking.status)" :value="amenityBookingStatusLabels[booking.status]" rounded />
            <Button v-if="canCancel" label="Cancel" icon="pi pi-times" severity="danger" outlined @click="cancelDialogVisible = true" />
            <Button label="Back" icon="pi pi-arrow-left" severity="secondary" outlined @click="router.push('/my/amenity-bookings')" />
          </div>
        </header>

        <dl class="booking-detail-grid">
          <div>
            <dt>Date and time</dt>
            <dd>{{ formatDateTime(booking.startsAt) }} - {{ formatDateTime(booking.endsAt) }}</dd>
          </div>
          <div>
            <dt>Requester</dt>
            <dd>{{ booking.requesterName }}</dd>
          </div>
          <div>
            <dt>Guests</dt>
            <dd>{{ booking.guestCount ?? '-' }}</dd>
          </div>
          <div>
            <dt>Purpose</dt>
            <dd>{{ booking.purpose }}</dd>
          </div>
          <div>
            <dt>Resident notes</dt>
            <dd>{{ booking.residentNotes || '-' }}</dd>
          </div>
          <div>
            <dt>Decision reason</dt>
            <dd>{{ booking.decisionReason || '-' }}</dd>
          </div>
        </dl>
      </section>

      <section class="surface-card booking-timeline">
        <header>
          <p class="eyebrow">Timeline</p>
          <h2>Status history</h2>
        </header>
        <div class="booking-event-list">
          <article v-for="event in booking.events" :key="event.id" class="booking-event">
            <i class="pi pi-circle-fill" aria-hidden="true" />
            <div>
              <strong>{{ event.eventType.replaceAll('_', ' ') }}</strong>
              <p>{{ event.message || 'No note' }}</p>
              <span>{{ formatDateTime(event.createdAt) }} · {{ event.actorName || 'System' }}</span>
            </div>
          </article>
        </div>
      </section>
    </template>
    <AppState v-else variant="empty" title="Booking not found" message="This booking is unavailable or outside your flat access." />

    <Dialog v-model:visible="cancelDialogVisible" modal header="Cancel booking" class="p-dialog-custom" :style="{ width: 'min(92vw, 32rem)' }">
      <div class="admin-form-grid">
        <label class="admin-form-grid__full">
          <span>Reason</span>
          <Textarea v-model="cancelReason" rows="3" auto-resize placeholder="Optional cancellation reason" />
        </label>
      </div>
      <div class="admin-inline-actions dialog-actions amenity-dialog-actions">
        <Button label="Keep booking" severity="secondary" outlined @click="cancelDialogVisible = false" />
        <Button label="Cancel booking" icon="pi pi-times" severity="danger" :loading="saving" @click="cancelBooking" />
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.booking-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin: 0;
}

.amenity-dialog-actions {
  margin-top: 1.5rem;
}

.booking-detail-grid div,
.booking-event {
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  padding: 0.85rem;
  background: var(--surface-ground);
}

.booking-detail-grid dt,
.booking-event span {
  color: var(--text-color-secondary);
  font-size: 0.85rem;
}

.booking-detail-grid dd,
.booking-timeline h2,
.booking-timeline p {
  margin: 0;
}

.booking-timeline,
.booking-event-list {
  display: grid;
  gap: 0.85rem;
}

.booking-event {
  display: flex;
  gap: 0.75rem;
}

.booking-event i {
  color: var(--primary-color);
  font-size: 0.65rem;
  margin-top: 0.35rem;
}
</style>
