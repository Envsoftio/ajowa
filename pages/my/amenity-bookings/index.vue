<script setup lang="ts">
import type { DataTablePageEvent } from 'primevue/datatable'
import type { AmenityBookingSummary, AmenitySummary } from '~/types/domain'
import {
  amenityBookingStatuses,
  amenityBookingStatusLabels,
  amenityBookingStatusSeverity,
  type AmenityBookingStatus,
} from '~/shared/amenity-bookings'

definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'My Bookings',
})

const api = useApi()
const router = useRouter()
const search = ref('')
const query = reactive({
  page: 1,
  pageSize: 20,
  search: '',
  status: '',
  amenityId: '',
})

const [bookingsAsyncData, optionsAsyncData] = await Promise.all([
  useAsyncData('my-amenity-bookings', () =>
    api<{ ok: true; data: { items: AmenityBookingSummary[]; total: number } }>('/api/my/amenity-bookings', {
      query,
    }),
    { watch: [query] },
  ),
  useAsyncData('my-amenity-options-list', () =>
    api<{ ok: true; data: { amenities: AmenitySummary[] } }>('/api/my/amenities'),
  ),
])

const { data, pending, refresh } = bookingsAsyncData
const { data: optionsData } = optionsAsyncData

const bookings = computed(() => data.value?.data.items ?? [])
const totalRecords = computed(() => data.value?.data.total ?? 0)
const amenities = computed(() => optionsData.value?.data.amenities ?? [])
const statusOptions = computed(() => [
  { label: 'All statuses', value: '' },
  ...amenityBookingStatuses.map((status) => ({ label: amenityBookingStatusLabels[status], value: status })),
])

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value))

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))

const onSearch = () => {
  query.page = 1
  query.search = search.value.trim()
}

const updateFilter = (key: 'status' | 'amenityId', value: string | null) => {
  query.page = 1
  query[key] = value ?? ''
}
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>My bookings</h1>
          <p>Track clubhouse and amenity requests across your linked flats.</p>
        </div>
        <div class="list-page__exports">
          <Button label="New booking" icon="pi pi-plus" as="a" href="/my/amenity-bookings/new" />
        </div>
      </header>

      <div class="list-page__toolbar">
        <IconField class="list-page__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="search" placeholder="Search booking number or amenity" @keydown.enter="onSearch" />
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
          <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined @click="() => refresh()" />
        </div>
      </div>

      <AppSkeletonState v-if="pending" />
      <AppState
        v-else-if="bookings.length === 0"
        variant="empty"
        title="No bookings found"
        message="Amenity booking requests will appear here after you submit them."
      />

      <template v-else>
        <AppDataTable
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
          <Column field="flatLabel" header="Flat" />
          <Column field="startsAt" header="Date">
            <template #body="{ data: row }">
              {{ formatDate(row.startsAt) }}
              <p class="table-muted">{{ formatTime(row.startsAt) }} - {{ formatTime(row.endsAt) }}</p>
            </template>
          </Column>
          <Column field="guestCount" header="Guests">
            <template #body="{ data: row }">
              {{ row.guestCount ?? '-' }}
            </template>
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
          <Column header="Actions" style="width: 120px">
            <template #body="{ data: row }">
              <Button icon="pi pi-eye" text rounded aria-label="View booking" @click="router.push(`/my/amenity-bookings/${row.id}`)" />
            </template>
          </Column>
        </AppDataTable>

        <div class="list-page__cards amenity-booking-cards">
          <article v-for="booking in bookings" :key="booking.id" class="list-card">
            <div class="list-card__header">
              <div>
                <h3>{{ booking.bookingNumber }}</h3>
                <p>{{ booking.amenityName }} · {{ booking.flatLabel }}</p>
              </div>
              <Tag
                :severity="amenityBookingStatusSeverity(booking.status)"
                :value="amenityBookingStatusLabels[booking.status]"
                rounded
              />
            </div>
            <div class="list-card__row">
              <span>Date</span>
              <strong>{{ formatDate(booking.startsAt) }}</strong>
            </div>
            <div class="list-card__row">
              <span>Time</span>
              <strong>{{ formatTime(booking.startsAt) }} - {{ formatTime(booking.endsAt) }}</strong>
            </div>
            <div class="admin-inline-actions">
              <Button label="View" icon="pi pi-eye" size="small" outlined @click="router.push(`/my/amenity-bookings/${booking.id}`)" />
            </div>
          </article>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.amenity-booking-cards {
  margin-top: 1rem;
}
</style>
