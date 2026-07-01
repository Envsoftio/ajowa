<script setup lang="ts">
import type { ListQueryParams } from '~/types/api'
import type { ServiceDepartment, ServiceRequestQueueSummary, ServiceRequestSummary } from '~/types/domain'
import type { ServiceRequestCreatePayload } from '~/composables/useServiceRequests'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Service Requests',
})

type StaffOption = { id: string; fullName: string; email: string }

const api = useApi()
const toast = useToast()
const router = useRouter()
const route = useRoute()
const serviceRequests = useServiceRequests('admin')

const routeFilterKeys = [
  'status',
  'priority',
  'departmentId',
  'assigneeUserId',
  'requesterUserId',
  'flatId',
  'locationType',
  'category',
  'unassigned',
  'overdue',
  'reopened',
  'commonArea',
  'activeOnly',
  'closedOnly',
]

const getRouteQueryValue = (key: string) => {
  const value = route.query[key]
  const firstValue = Array.isArray(value) ? value[0] : value

  return typeof firstValue === 'string' ? firstValue.trim() : ''
}

const initialFilters = routeFilterKeys.reduce<Record<string, string[]>>((filters, key) => {
  const value = getRouteQueryValue(key)

  if (value) {
    filters[key] = [value]
  }

  return filters
}, {})

const query = ref<ListQueryParams>({
  page: 1,
  pageSize: 20,
  search: '',
  sortBy: 'createdAt',
  sortDirection: 'desc',
  filters: initialFilters,
})
const globalSearch = ref('')
const assignDialogVisible = ref(false)
const createDialogVisible = ref(false)
const selectedTicket = ref<ServiceRequestSummary | null>(null)
const saving = ref(false)

const loadTickets = () =>
  api<{ ok: true; data: { items: ServiceRequestSummary[]; total: number; summary: ServiceRequestQueueSummary } }>('/api/admin/service-requests', {
    query: {
      page: query.value.page,
      pageSize: query.value.pageSize,
      search: query.value.search,
      sortBy: query.value.sortBy,
      sortDirection: query.value.sortDirection,
      ...Object.fromEntries(Object.entries(query.value.filters).map(([key, value]) => [key, value[0]])),
    },
  })

const [
  ticketsAsyncData,
  optionsAsyncData,
] = await Promise.all([
  useAsyncData('admin-service-requests', loadTickets, { watch: [query] }),
  useAsyncData('admin-service-request-options', () =>
    api<{
      ok: true
      data: {
        departments: ServiceDepartment[]
        staff: StaffOption[]
        flats: Array<{ id: string; label: string }>
      }
    }>('/api/service-requests/options'),
  ),
])

const { data, pending, refresh } = ticketsAsyncData
const { data: optionsData } = optionsAsyncData

const tickets = computed(() => data.value?.data.items ?? [])
const summary = computed(() => data.value?.data.summary)
const departments = computed(() => optionsData.value?.data.departments ?? [])
const staff = computed(() => optionsData.value?.data.staff ?? [])
const flatOptions = computed(() => optionsData.value?.data.flats ?? [])

const summaryCards = computed(() => [
  { title: 'Open', value: summary.value?.open ?? 0, severity: 'info' },
  { title: 'Unassigned', value: summary.value?.unassigned ?? 0, severity: 'warn' },
  { title: 'Overdue', value: summary.value?.overdue ?? 0, severity: 'danger' },
  { title: 'Emergency', value: summary.value?.emergency ?? 0, severity: 'danger' },
  { title: 'Reopened', value: summary.value?.reopened ?? 0, severity: 'warn' },
])

const updateFilter = (key: string, value: string | boolean | null) => {
  const filters = {
    ...query.value.filters,
    [key]: value == null || value === '' ? [] : [String(value)],
  }

  if (key === 'status' && value) {
    delete filters.activeOnly
  }

  query.value = {
    ...query.value,
    page: 1,
    filters,
  }
}

const quickFilter = (key: string) => {
  const quickFilters: Record<string, Record<string, string[]>> = {
    unassigned: { unassigned: ['true'] },
    emergency: { priority: ['EMERGENCY'] },
    overdue: { overdue: ['true'] },
    reopened: { reopened: ['true'] },
    commonArea: { commonArea: ['true'] },
  }
  query.value = { ...query.value, page: 1, filters: quickFilters[key] ?? {} }
}

const clearFilters = () => {
  query.value = { ...query.value, page: 1, filters: {} }
}

const onSearch = () => {
  query.value = { ...query.value, page: 1, search: globalSearch.value.trim() }
}

const openAssign = (ticket: ServiceRequestSummary) => {
  selectedTicket.value = ticket
  assignDialogVisible.value = true
}

const assignTicket = async (payload: { departmentId: string; assigneeUserId?: string | null; reason?: string }) => {
  if (!selectedTicket.value) {
    return
  }
  saving.value = true
  try {
    await serviceRequests.assignTicket(selectedTicket.value.id, payload)
    toast.add({ severity: 'success', summary: 'Assigned', detail: 'Ticket assignment updated.', life: 10000 })
    assignDialogVisible.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

const createTicket = async (payload: ServiceRequestCreatePayload) => {
  saving.value = true
  try {
    const response = await serviceRequests.createTicket(payload)
    toast.add({ severity: 'success', summary: 'Ticket created', detail: response.data.requestNumber, life: 10000 })
    createDialogVisible.value = false
    await refresh()
  } finally {
    saving.value = false
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
          <h1>Service request console</h1>
          <p>Assign, prioritize, and audit every operational complaint.</p>
        </div>
        <div class="list-page__exports">
          <Button label="New ticket" icon="pi pi-plus" @click="createDialogVisible = true" />
        </div>
      </header>

      <div class="list-page__toolbar">
        <IconField class="list-page__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="globalSearch" placeholder="Search tickets, requester, flat, area" @keydown.enter="onSearch" />
        </IconField>
        <div class="list-page__filters">
          <Select
            :model-value="query.filters.status?.[0] ?? ''"
            :options="['', 'OPEN', 'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED']"
            placeholder="Status"
            @update:model-value="updateFilter('status', $event)"
          />
          <Select
            :model-value="query.filters.priority?.[0] ?? ''"
            :options="['', 'LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']"
            placeholder="Priority"
            @update:model-value="updateFilter('priority', $event)"
          />
          <Select
            :model-value="query.filters.departmentId?.[0] ?? ''"
            :options="departments"
            option-label="name"
            option-value="id"
            show-clear
            placeholder="Department"
            @update:model-value="updateFilter('departmentId', $event)"
          />
          <Button label="Search" icon="pi pi-search" @click="onSearch" />
        </div>
      </div>

      <div class="ticket-chip-row">
        <Button label="Unassigned" size="small" outlined @click="quickFilter('unassigned')" />
        <Button label="Emergency" size="small" outlined severity="danger" @click="quickFilter('emergency')" />
        <Button label="Overdue" size="small" outlined severity="danger" @click="quickFilter('overdue')" />
        <Button label="Reopened" size="small" outlined severity="warn" @click="quickFilter('reopened')" />
        <Button label="Common Area" size="small" outlined severity="secondary" @click="quickFilter('commonArea')" />
        <Button label="Clear" size="small" text @click="clearFilters" />
      </div>

      <TicketDataTable
        :tickets="tickets"
        :loading="pending"
        @open="router.push(`/admin/service-requests/${$event.id}`)"
        @assign="openAssign"
        @status="router.push(`/admin/service-requests/${$event.id}`)"
      />
    </section>

    <section class="surface-card">
      <div class="service-panel__header">
        <div>
          <p class="eyebrow">Backlog</p>
          <h2>Department workload</h2>
        </div>
      </div>
      <DepartmentQueueWidget :backlog="summary?.departmentBacklog ?? []" />
    </section>

    <Dialog v-model:visible="assignDialogVisible" header="Assign ticket" modal :style="{ width: '720px', maxWidth: '95vw' }">
      <DepartmentAssignPanel
        :ticket="selectedTicket"
        :departments="departments"
        :staff-options="staff"
        :saving="saving"
        @assign="assignTicket"
      />
    </Dialog>

    <Dialog v-model:visible="createDialogVisible" header="Create service request" modal :style="{ width: '860px', maxWidth: '96vw' }">
      <TicketForm
        admin-mode
        :flat-options="flatOptions"
        :departments="departments"
        :staff-options="staff"
        :saving="saving"
        @submit="createTicket"
      />
    </Dialog>
  </div>
</template>

<style scoped>
.service-summary-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.ticket-chip-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

@media (max-width: 900px) {
  .service-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
