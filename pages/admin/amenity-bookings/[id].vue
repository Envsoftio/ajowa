<script setup lang="ts">
import type { AmenityBookingDetail } from '~/types/domain'
import {
  amenityBookingStatusLabels,
  amenityBookingStatusSeverity,
} from '~/shared/amenity-bookings'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Amenity Booking Detail',
})

type ActionMode = 'approve' | 'reject' | 'cancel'

const api = useApi()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const bookingId = computed(() => String(route.params.id))
const actionDialogVisible = ref(false)
const actionMode = ref<ActionMode>('approve')
const actionNote = ref('')
const saving = ref(false)

const { data, pending, refresh } = await useAsyncData(`admin-amenity-booking-${bookingId.value}`, () =>
  api<{ ok: true; data: AmenityBookingDetail }>(`/api/admin/amenity-bookings/${bookingId.value}`),
)

const booking = computed(() => data.value?.data ?? null)

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '-'

const openAction = (mode: ActionMode) => {
  actionMode.value = mode
  actionNote.value = ''
  actionDialogVisible.value = true
}

const actionTitle = computed(() => {
  if (actionMode.value === 'approve') return 'Approve booking'
  if (actionMode.value === 'reject') return 'Reject booking'
  return 'Cancel booking'
})

const actionHelpText = computed(() => {
  if (actionMode.value === 'approve') return 'Approve confirms the request and reserves the selected time.'
  if (actionMode.value === 'reject') return 'Reject is for saying no to a pending request before approval.'
  return 'Cancel withdraws or stops an existing request or approved booking.'
})

const submitAction = async () => {
  if (!booking.value || saving.value) return

  saving.value = true
  try {
    const body =
      actionMode.value === 'approve'
        ? { adminNotes: actionNote.value || null }
        : { reason: actionNote.value }

    await api(`/api/admin/amenity-bookings/${booking.value.id}/${actionMode.value}`, {
      method: 'POST',
      body,
    })
    toast.add({ severity: 'success', summary: 'Booking updated', detail: booking.value.bookingNumber, life: 10000 })
    actionDialogVisible.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

const completeBooking = async () => {
  if (!booking.value || saving.value) return

  saving.value = true
  try {
    await api(`/api/admin/amenity-bookings/${booking.value.id}/complete`, { method: 'POST' })
    toast.add({ severity: 'success', summary: 'Booking completed', detail: booking.value.bookingNumber, life: 10000 })
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
            <Button v-if="booking.status === 'REQUESTED'" label="Approve" icon="pi pi-check" severity="success" @click="openAction('approve')" />
            <Button v-if="booking.status === 'REQUESTED'" label="Reject" icon="pi pi-times" severity="danger" outlined @click="openAction('reject')" />
            <Button v-if="['REQUESTED', 'APPROVED'].includes(booking.status)" label="Cancel" icon="pi pi-ban" severity="secondary" outlined @click="openAction('cancel')" />
            <Button v-if="booking.status === 'APPROVED'" label="Complete" icon="pi pi-check-circle" severity="secondary" outlined :loading="saving" @click="completeBooking" />
            <Button label="Back" icon="pi pi-arrow-left" severity="secondary" outlined @click="router.push('/admin/amenity-bookings')" />
          </div>
        </header>

        <dl class="booking-detail-grid">
          <div>
            <dt>Date and time</dt>
            <dd>{{ formatDateTime(booking.startsAt) }} - {{ formatDateTime(booking.endsAt) }}</dd>
          </div>
          <div>
            <dt>Requester</dt>
            <dd>{{ booking.requesterName }} · {{ booking.requesterMobileNumber || '-' }}</dd>
          </div>
          <div>
            <dt>Flat</dt>
            <dd>{{ booking.flatLabel }}</dd>
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
            <dt>Admin notes</dt>
            <dd>{{ booking.adminNotes || '-' }}</dd>
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
    <AppState v-else variant="empty" title="Booking not found" message="This booking is unavailable." />

    <Dialog v-model:visible="actionDialogVisible" modal :header="actionTitle" class="p-dialog-custom" :style="{ width: 'min(92vw, 34rem)' }">
      <div class="admin-form-grid">
        <Message class="admin-form-grid__full" severity="info" :closable="false">
          {{ actionHelpText }}
        </Message>
        <label class="admin-form-grid__full">
          <span>{{ actionMode === 'approve' ? 'Admin notes' : 'Reason' }}</span>
          <Textarea v-model="actionNote" rows="3" auto-resize :placeholder="actionMode === 'approve' ? 'Optional approval note' : 'Required reason'" />
        </label>
      </div>
      <div class="admin-inline-actions dialog-actions amenity-dialog-actions">
        <Button label="Close" severity="secondary" outlined @click="actionDialogVisible = false" />
        <Button
          :label="actionMode === 'approve' ? 'Approve' : actionMode === 'reject' ? 'Reject' : 'Cancel booking'"
          :icon="actionMode === 'approve' ? 'pi pi-check' : 'pi pi-times'"
          :severity="actionMode === 'approve' ? 'success' : 'danger'"
          :loading="saving"
          @click="submitAction"
        />
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
