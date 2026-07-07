<script setup lang="ts">
import type { DataTablePageEvent } from 'primevue/datatable'
import type { AmenityBlackoutSummary, AmenityBookingSummary, AmenitySummary } from '~/types/domain'
import {
  amenityBookingStatuses,
  amenityBookingStatusLabels,
  amenityBookingStatusSeverity,
  type AmenityBookingStatus,
} from '~/shared/amenity-bookings'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Amenity Bookings',
})

type ActionMode = 'approve' | 'reject' | 'cancel'

const api = useApi()
const router = useRouter()
const toast = useToast()
const confirmAction = useAppConfirm()
const search = ref('')
const saving = ref(false)
const clearingBlackoutId = ref<string | null>(null)
const actionDialogVisible = ref(false)
const blackoutDialogVisible = ref(false)
const actionMode = ref<ActionMode>('approve')
const selectedBooking = ref<AmenityBookingSummary | null>(null)
const actionNote = ref('')

const query = reactive({
  page: 1,
  pageSize: 20,
  search: '',
  status: 'REQUESTED',
  amenityId: '',
})

const blackoutForm = reactive({
  amenityId: '',
  title: '',
  date: '',
  startTime: '',
  endTime: '',
  reason: '',
})

const loadBookings = () =>
  api<{ ok: true; data: { items: AmenityBookingSummary[]; total: number } }>('/api/admin/amenity-bookings', {
    query,
  })

const [bookingsAsyncData, amenitiesAsyncData, blackoutsAsyncData] = await Promise.all([
  useAsyncData('admin-amenity-bookings', loadBookings, { watch: [query] }),
  useAsyncData('admin-amenity-booking-amenities', () =>
    api<{ ok: true; data: AmenitySummary[] }>('/api/admin/amenities'),
  ),
  useAsyncData('admin-amenity-blackouts', () =>
    api<{ ok: true; data: AmenityBlackoutSummary[] }>('/api/admin/amenity-blackouts'),
  ),
])

const { data, pending, refresh } = bookingsAsyncData
const { data: amenitiesData } = amenitiesAsyncData
const { data: blackoutsData, refresh: refreshBlackouts } = blackoutsAsyncData

const bookings = computed(() => data.value?.data.items ?? [])
const totalRecords = computed(() => data.value?.data.total ?? 0)
const amenities = computed(() => amenitiesData.value?.data ?? [])
const blackouts = computed(() => blackoutsData.value?.data ?? [])
const visibleBlackouts = computed(() => blackouts.value.slice(0, 8))
const canCreateBlackout = computed(() =>
  Boolean(blackoutForm.amenityId && blackoutForm.title.trim() && blackoutForm.date && blackoutForm.startTime && blackoutForm.endTime),
)
const statusOptions = computed(() => [
  { label: 'All statuses', value: '' },
  ...amenityBookingStatuses.map((status) => ({ label: amenityBookingStatusLabels[status], value: status })),
])

const summaryCards = computed(() => {
  const rows = bookings.value
  return [
    { title: 'Requested', value: rows.filter((row) => row.status === 'REQUESTED').length, severity: 'info' },
    { title: 'Approved', value: rows.filter((row) => row.status === 'APPROVED').length, severity: 'success' },
    { title: 'Cancelled', value: rows.filter((row) => row.status === 'CANCELLED').length, severity: 'danger' },
  ]
})

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value))

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))

const localDateTimeToIso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString()

const updateFilter = (key: 'status' | 'amenityId', value: string | null) => {
  query.page = 1
  query[key] = value ?? ''
}

const onSearch = () => {
  query.page = 1
  query.search = search.value.trim()
}

const openAction = (mode: ActionMode, booking: AmenityBookingSummary) => {
  actionMode.value = mode
  selectedBooking.value = booking
  actionNote.value = ''
  actionDialogVisible.value = true
}

const resetBlackoutForm = () => {
  Object.assign(blackoutForm, {
    amenityId: '',
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    reason: '',
  })
}

const openBlackoutDialog = () => {
  resetBlackoutForm()
  blackoutForm.amenityId = query.amenityId || amenities.value[0]?.id || ''
  blackoutDialogVisible.value = true
}

const actionTitle = computed(() => {
  if (actionMode.value === 'approve') return 'Approve booking'
  if (actionMode.value === 'reject') return 'Reject booking'
  return 'Cancel booking'
})

const actionLabel = computed(() => {
  if (actionMode.value === 'approve') return 'Approve'
  if (actionMode.value === 'reject') return 'Reject'
  return 'Cancel booking'
})

const actionHelpText = computed(() => {
  if (actionMode.value === 'approve') return 'Approve confirms the request and reserves the selected time.'
  if (actionMode.value === 'reject') return 'Reject is for saying no to a pending request before approval.'
  return 'Cancel withdraws or stops an existing request or approved booking.'
})

const submitAction = async () => {
  if (!selectedBooking.value || saving.value) return

  saving.value = true
  try {
    const id = selectedBooking.value.id
    const path = `/api/admin/amenity-bookings/${id}/${actionMode.value}`
    const body =
      actionMode.value === 'approve'
        ? { adminNotes: actionNote.value || null }
        : { reason: actionNote.value }

    await api(path, { method: 'POST', body })
    toast.add({ severity: 'success', summary: 'Booking updated', detail: selectedBooking.value.bookingNumber, life: 10000 })
    actionDialogVisible.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

const createBlackout = async () => {
  if (!canCreateBlackout.value || saving.value) return

  saving.value = true
  try {
    await api('/api/admin/amenity-blackouts', {
      method: 'POST',
      body: {
        amenityId: blackoutForm.amenityId,
        title: blackoutForm.title,
        startsAt: localDateTimeToIso(blackoutForm.date, blackoutForm.startTime),
        endsAt: localDateTimeToIso(blackoutForm.date, blackoutForm.endTime),
        reason: blackoutForm.reason || null,
      },
    })
    toast.add({ severity: 'success', summary: 'Blackout created', life: 10000 })
    blackoutDialogVisible.value = false
    resetBlackoutForm()
    await Promise.all([refresh(), refreshBlackouts()])
  } finally {
    saving.value = false
  }
}

const clearBlackout = async (blackout: AmenityBlackoutSummary) => {
  if (clearingBlackoutId.value) return

  const confirmed = await confirmAction({
    header: 'Clear blackout?',
    message: `Clear ${blackout.title}? This will make the blocked time available for booking again.`,
    acceptLabel: 'Clear blackout',
    acceptSeverity: 'danger',
  })

  if (!confirmed) return

  clearingBlackoutId.value = blackout.id
  try {
    await api(`/api/admin/amenity-blackouts/${blackout.id}`, {
      method: 'DELETE',
    })
    toast.add({ severity: 'success', summary: 'Blackout cleared', detail: blackout.title, life: 10000 })
    await Promise.all([refresh(), refreshBlackouts()])
  } finally {
    clearingBlackoutId.value = null
  }
}
</script>

<template>
  <div class="landing-page">
    <section class="surface-grid dashboard-kpis service-summary-grid">
      <section v-for="card in summaryCards" :key="card.title" class="surface-card">
        <p class="eyebrow">{{ card.title }}</p>
        <h3>{{ card.value }}</h3>
        <Tag :severity="card.severity" :value="card.title" rounded />
      </section>
    </section>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Amenity booking queue</h1>
          <p>Review requests, prevent conflicts, and block unavailable windows.</p>
        </div>
        <div class="list-page__exports">
          <Button label="Block time" icon="pi pi-ban" severity="secondary" outlined @click="openBlackoutDialog" />
          <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined @click="() => refresh()" />
        </div>
      </header>

      <div class="list-page__toolbar">
        <IconField class="list-page__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="search" placeholder="Search booking, requester, phone, flat" @keydown.enter="onSearch" />
        </IconField>
        <div class="list-page__filters">
          <Select
            :model-value="query.status"
            :options="statusOptions"
            option-label="label"
            option-value="value"
            placeholder="Status"
            @update:model-value="updateFilter('status', $event)"
          />
          <Select
            :model-value="query.amenityId"
            :options="amenities"
            option-label="name"
            option-value="id"
            show-clear
            placeholder="Amenity"
            @update:model-value="updateFilter('amenityId', $event)"
          />
          <Button label="Search" icon="pi pi-search" @click="onSearch" />
          <Button label="Clear" severity="secondary" outlined @click="() => { query.status = ''; query.amenityId = ''; search = ''; onSearch() }" />
        </div>
      </div>

      <AppSkeletonState v-if="pending" />
      <AppState
        v-else-if="bookings.length === 0"
        variant="empty"
        title="No bookings found"
        message="Amenity booking requests and reservations will appear here."
      />
      <AppDataTable
        v-else
        :value="bookings"
        paginator
        :rows="query.pageSize"
        :total-records="totalRecords"
        :lazy="true"
        responsive-layout="scroll"
        class="list-page__table"
        data-key="id"
        @page="
          (event: DataTablePageEvent) => {
            query.page = Math.floor(event.first / event.rows) + 1
            query.pageSize = event.rows
          }
        "
      >
        <Column field="bookingNumber" header="Booking">
          <template #body="{ data: row }">
            <strong>{{ row.bookingNumber }}</strong>
            <p class="table-muted">{{ row.amenityName }}</p>
          </template>
        </Column>
        <Column field="flatLabel" header="Flat">
          <template #body="{ data: row }">
            {{ row.flatLabel }}
            <p class="table-muted">{{ row.requesterName }}</p>
          </template>
        </Column>
        <Column field="startsAt" header="Window">
          <template #body="{ data: row }">
            {{ formatDateTime(row.startsAt) }}
            <p class="table-muted">to {{ formatDateTime(row.endsAt) }}</p>
          </template>
        </Column>
        <Column field="guestCount" header="Guests">
          <template #body="{ data: row }">{{ row.guestCount ?? '-' }}</template>
        </Column>
        <Column field="status" header="Status">
          <template #body="{ data: row }">
            <Tag
              :severity="amenityBookingStatusSeverity(row.status as AmenityBookingStatus)"
              :value="amenityBookingStatusLabels[row.status as AmenityBookingStatus]"
              rounded
            />
          </template>
        </Column>
        <Column header="Actions" style="min-width: 15rem">
          <template #body="{ data: row }">
            <div class="admin-inline-actions" style="gap: 0.15rem">
              <Button icon="pi pi-eye" text rounded aria-label="View booking" @click="router.push(`/admin/amenity-bookings/${row.id}`)" />
              <Button v-if="row.status === 'REQUESTED'" icon="pi pi-check" text rounded severity="success" aria-label="Approve booking" @click="openAction('approve', row)" />
              <Button v-if="row.status === 'REQUESTED'" icon="pi pi-times" text rounded severity="danger" aria-label="Reject booking" @click="openAction('reject', row)" />
              <Button v-if="['REQUESTED', 'APPROVED'].includes(row.status)" icon="pi pi-ban" text rounded severity="secondary" aria-label="Cancel booking" @click="openAction('cancel', row)" />
            </div>
          </template>
        </Column>
      </AppDataTable>
    </section>

    <section class="surface-card blackout-summary">
      <header class="blackout-summary__header">
        <div>
          <p class="eyebrow">Blackouts</p>
          <h2>Upcoming blocked windows</h2>
        </div>
        <div class="admin-inline-actions">
          <Button label="Block time" icon="pi pi-ban" size="small" severity="secondary" outlined @click="openBlackoutDialog" />
          <Button icon="pi pi-refresh" size="small" text rounded aria-label="Refresh blackouts" @click="() => refreshBlackouts()" />
        </div>
      </header>
      <div v-if="visibleBlackouts.length" class="blackout-list">
        <article v-for="blackout in visibleBlackouts" :key="blackout.id" class="blackout-card">
          <header class="blackout-card__header">
            <div>
              <strong>{{ blackout.title }}</strong>
              <span>{{ blackout.amenityName }}</span>
            </div>
            <Tag value="Blocked" severity="danger" rounded />
          </header>
          <dl class="blackout-card__meta">
            <div>
              <dt>Date</dt>
              <dd>{{ formatDate(blackout.startsAt) }}</dd>
            </div>
            <div>
              <dt>Window</dt>
              <dd>{{ formatTime(blackout.startsAt) }} - {{ formatTime(blackout.endsAt) }}</dd>
            </div>
          </dl>
          <p v-if="blackout.reason" class="blackout-card__reason">{{ blackout.reason }}</p>
          <footer class="blackout-card__footer">
            <div>
              <span>{{ blackout.createdByName ? `By ${blackout.createdByName}` : 'System blocked' }}</span>
              <span>Ends {{ formatDateTime(blackout.endsAt) }}</span>
            </div>
            <Button
              label="Clear"
              icon="pi pi-trash"
              size="small"
              severity="danger"
              text
              :loading="clearingBlackoutId === blackout.id"
              @click="clearBlackout(blackout)"
            />
          </footer>
        </article>
      </div>
      <AppState v-else variant="empty" title="No upcoming blackouts" message="Blocked windows will appear here." />
    </section>

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
        <Button :label="actionLabel" :icon="actionMode === 'approve' ? 'pi pi-check' : 'pi pi-times'" :severity="actionMode === 'approve' ? 'success' : 'danger'" :loading="saving" @click="submitAction" />
      </div>
    </Dialog>

    <Dialog v-model:visible="blackoutDialogVisible" modal header="Block amenity time" class="p-dialog-custom" :style="{ width: 'min(92vw, 42rem)' }">
      <div class="admin-form-grid">
        <label>
          <span>Amenity</span>
          <Select v-model="blackoutForm.amenityId" :options="amenities" option-label="name" option-value="id" placeholder="Select amenity" />
        </label>
        <label>
          <span>Title</span>
          <InputText v-model="blackoutForm.title" placeholder="Maintenance, society event..." />
        </label>
        <label>
          <span>Date</span>
          <InputText v-model="blackoutForm.date" type="date" />
        </label>
        <label>
          <span>Start</span>
          <InputText v-model="blackoutForm.startTime" type="time" step="1800" />
        </label>
        <label>
          <span>End</span>
          <InputText v-model="blackoutForm.endTime" type="time" step="1800" />
        </label>
        <label class="admin-form-grid__full">
          <span>Reason</span>
          <Textarea v-model="blackoutForm.reason" rows="3" auto-resize />
        </label>
      </div>
      <div class="admin-inline-actions dialog-actions amenity-dialog-actions">
        <Button label="Close" severity="secondary" outlined @click="blackoutDialogVisible = false" />
        <Button label="Clear" icon="pi pi-eraser" severity="secondary" text @click="resetBlackoutForm" />
        <Button label="Create blackout" icon="pi pi-ban" :disabled="!canCreateBlackout" :loading="saving" @click="createBlackout" />
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.blackout-summary,
.blackout-list {
  display: grid;
  gap: 1rem;
}

.blackout-summary__header,
.blackout-card__header,
.blackout-card__footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.blackout-summary h2,
.blackout-card p,
.blackout-card dl,
.blackout-card dd {
  margin: 0;
}

.amenity-dialog-actions {
  margin-top: 1.5rem;
}

.blackout-list {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.blackout-card {
  display: grid;
  gap: 0.85rem;
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  padding: 1rem;
  background: var(--surface-ground);
}

.blackout-card__header > div,
.blackout-card__meta > div {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}

.blackout-card__header strong {
  line-height: 1.25;
}

.blackout-card__header span,
.blackout-card__footer,
.blackout-card__meta dt {
  color: var(--text-color-secondary);
}

.blackout-card__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.blackout-card__meta dt,
.blackout-card__footer {
  font-size: 0.85rem;
}

.blackout-card__meta dd {
  font-weight: 700;
}

.blackout-card__reason {
  border-left: 3px solid var(--primary-color);
  padding-left: 0.65rem;
  color: var(--text-color-secondary);
  line-height: 1.45;
}

.blackout-card__footer {
  flex-wrap: wrap;
  padding-top: 0.75rem;
  border-top: 1px solid var(--surface-border);
}

.blackout-card__footer > div {
  display: grid;
  gap: 0.2rem;
}

@media (max-width: 640px) {
  .blackout-summary__header,
  .blackout-card__header,
  .blackout-card__footer {
    align-items: stretch;
    flex-direction: column;
  }

  .blackout-card__meta {
    grid-template-columns: 1fr;
  }
}
</style>
