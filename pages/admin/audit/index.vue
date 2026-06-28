<script setup lang="ts">
import type { DataTablePageEvent, DataTableSortEvent } from 'primevue/datatable'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Audit Log',
})

type AuditEntity = {
  entityTable: string
  entityId: string
  entityLabel: string | null
}

type AuditEntry = {
  id: string
  occurredAt: string
  module: string
  eventKey: string
  action: string
  severity: string
  actorUserId: string | null
  actorName: string | null
  actorRole: string | null
  targetName: string | null
  requestId: string | null
  metadata: Record<string, unknown>
  entities: AuditEntity[]
}

type AuditResponse = {
  ok: true
  data: {
    items: AuditEntry[]
    total: number
    page: number
    pageSize: number
  }
}

const api = useApi()

const query = reactive({
  page: 1,
  pageSize: 25,
  search: '',
  sortBy: 'occurredAt',
  sortDirection: 'desc',
  module: '',
  action: '',
  actorRole: '',
  actorId: '',
  actorName: '',
  entityTable: '',
  entityId: '',
  eventKey: '',
  path: '',
  auditType: 'domain',
  dateFrom: '',
  dateTo: '',
})

const moduleOptions = [
  '',
  'AUTH',
  'MASTER',
  'BILLING',
  'PAYMENTS',
  'ACCESS',
  'FINANCE',
  'SERVICE',
  'NOTICE',
  'NOTIFICATION',
  'REPORT',
]

const actionOptions = [
  '',
  'CREATED',
  'UPDATED',
  'DELETED',
  'RESTORED',
  'STATE_CHANGED',
]

const roleOptions = [
  '',
  'ADMIN',
  'MANAGER',
  'SERVICE_STAFF',
  'GUARD',
  'RESIDENT',
]

const auditTypeOptions = [
  { label: 'All audit rows', value: '' },
  { label: 'Generic API logs', value: 'generic' },
  { label: 'Domain audit rows', value: 'domain' },
]

const eventLabels: Record<string, string> = {
  'maintenance_due.cam_recomputed': 'CAM dues recomputed',
  'maintenance_due.created': 'Maintenance due created',
  'maintenance_dues.generated': 'Maintenance dues generated',
  'maintenance_due.updated': 'Maintenance due updated',
  'maintenance_due.bulk_due_date_updated': 'Bulk due dates updated',
  'maintenance_due.bill': 'Bill generated',
  'maintenance_due.bills_queued': 'Bills queued',
  'maintenance_due.reminder': 'Due reminder sent',
  'maintenance_due.reminders_queued': 'Due reminders queued',
  'cam_advance_coverage.created': 'CAM advance coverage created',
  'cam_advance_coverage.updated': 'CAM advance coverage updated',
  'cam_advance_coverage.deactivated': 'CAM advance coverage deactivated',
  'billing_charges.updated': 'CAM charges updated',
  'finance.transactions.created': 'Finance transaction created',
  'finance.transactions.updated': 'Finance transaction updated',
  'finance.transactions.approved': 'Finance transaction approved',
  'finance.transactions.rejected': 'Finance transaction rejected',
  'finance.transactions.returned': 'Finance transaction returned',
  'finance.transactions.reversed': 'Finance transaction reversed',
  'residents.created': 'Resident created',
  'residents.updated': 'Resident updated',
  'residents.notes.updated': 'Resident notes updated',
  'residents.file.updated': 'Resident file updated',
}

const eventLabel = (eventKey: string) =>
  eventLabels[eventKey] ??
  eventKey
    .replace(/^api\.(post|put|patch|delete)\./, '')
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase()
      if (upper === 'CAM' || upper === 'QR' || upper === 'ID') return upper
      return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`
    })
    .join(' ')

const loadAuditLog = () =>
  api<AuditResponse>('/api/admin/audit', {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      module: query.module || undefined,
      action: query.action || undefined,
      actorRole: query.actorRole || undefined,
      actorId: query.actorId || undefined,
      actorName: query.actorName || undefined,
      entityTable: query.entityTable || undefined,
      entityId: query.entityId || undefined,
      eventKey: query.eventKey || undefined,
      path: query.path || undefined,
      auditType: query.auditType || undefined,
      dateFrom: query.dateFrom || undefined,
      dateTo: query.dateTo || undefined,
    },
  })

const { data, pending, refresh } = await useAsyncData('admin-audit-log', loadAuditLog, {
  watch: [query],
})

const rows = computed(() => data.value?.data.items ?? [])
const totalRecords = computed(() => data.value?.data.total ?? 0)

const hasActiveFilters = computed(() =>
  query.search !== '' ||
  query.module !== '' ||
  query.action !== '' ||
  query.actorRole !== '' ||
  query.actorId !== '' ||
  query.actorName !== '' ||
  query.entityTable !== '' ||
  query.entityId !== '' ||
  query.eventKey !== '' ||
  query.path !== '' ||
  query.auditType !== '' ||
  query.dateFrom !== '' ||
  query.dateTo !== '',
)

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const severitySeverity = (severity: string) => {
  if (severity === 'CRITICAL') return 'danger'
  if (severity === 'HIGH') return 'warn'
  if (severity === 'MEDIUM') return 'info'
  return 'secondary'
}

const actorDisplay = (row: AuditEntry) =>
  row.actorName ?? (row.actorUserId ? 'System user' : 'System')

const metadataPath = (row: AuditEntry) =>
  typeof row.metadata.path === 'string' ? row.metadata.path : ''

const entitySummary = (row: AuditEntry) => {
  const primary = row.entities.find((entity) => entity.entityTable !== 'society_profile') ?? row.entities[0]
  if (!primary) return '-'
  return primary.entityLabel ?? `${primary.entityTable}: ${primary.entityId}`
}

const clearFilters = () => {
  query.search = ''
  query.module = ''
  query.action = ''
  query.actorRole = ''
  query.actorId = ''
  query.actorName = ''
  query.entityTable = ''
  query.entityId = ''
  query.eventKey = ''
  query.path = ''
  query.auditType = 'domain'
  query.dateFrom = ''
  query.dateTo = ''
  query.page = 1
}

watch(
  () => [
    query.search,
    query.module,
    query.action,
    query.actorRole,
    query.actorId,
    query.actorName,
    query.entityTable,
    query.entityId,
    query.eventKey,
    query.path,
    query.auditType,
    query.dateFrom,
    query.dateTo,
  ],
  () => {
    query.page = 1
  },
)

const onPage = (event: DataTablePageEvent) => {
  query.page = Math.floor(event.first / event.rows) + 1
  query.pageSize = event.rows
}

const onSort = (event: DataTableSortEvent) => {
  query.sortBy = typeof event.sortField === 'string' ? event.sortField : 'occurredAt'
  query.sortDirection = event.sortOrder === 1 ? 'asc' : 'desc'
  query.page = 1
}
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <p class="eyebrow">System audit</p>
          <h1>Audit log</h1>
          <p>Review successful changes across app modules by user, role, route, and entity.</p>
        </div>
        <div class="list-page__exports">
          <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined :loading="pending" @click="() => refresh()" />
          <Button label="Clear filters" icon="pi pi-filter-slash" severity="secondary" outlined :disabled="!hasActiveFilters" @click="clearFilters" />
        </div>
      </header>

      <div class="list-page__toolbar">
        <IconField class="list-page__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="query.search" placeholder="Search event, actor, entity, request, or metadata" />
        </IconField>
        <div class="list-page__filters">
          <label>
            <span class="field-label">From</span>
            <InputText v-model="query.dateFrom" type="date" />
          </label>
          <label>
            <span class="field-label">To</span>
            <InputText v-model="query.dateTo" type="date" />
          </label>
          <label>
            <span class="field-label">Module</span>
            <Select v-model="query.module" :options="moduleOptions" placeholder="All modules" />
          </label>
          <label>
            <span class="field-label">Action</span>
            <Select v-model="query.action" :options="actionOptions" placeholder="All actions" />
          </label>
          <label>
            <span class="field-label">Role</span>
            <Select v-model="query.actorRole" :options="roleOptions" placeholder="All roles" />
          </label>
          <label>
            <span class="field-label">Audit type</span>
            <Select v-model="query.auditType" :options="auditTypeOptions" option-label="label" option-value="value" />
          </label>
          <label>
            <span class="field-label">Actor name</span>
            <InputText v-model="query.actorName" placeholder="Type name" />
          </label>
          <label>
            <span class="field-label">Actor user ID</span>
            <InputText v-model="query.actorId" placeholder="Actor user ID" />
          </label>
          <label>
            <span class="field-label">Route path</span>
            <InputText v-model="query.path" placeholder="/api/admin/residents" />
          </label>
          <label>
            <span class="field-label">Entity table</span>
            <InputText v-model="query.entityTable" placeholder="transactions" />
          </label>
          <label>
            <span class="field-label">Entity ID</span>
            <InputText v-model="query.entityId" placeholder="Entity UUID" />
          </label>
          <label>
            <span class="field-label">Event key</span>
            <InputText v-model="query.eventKey" placeholder="finance.transactions.updated" />
          </label>
        </div>
      </div>

      <AppDataTable
        :value="rows"
        :loading="pending"
        paginator
        :rows="query.pageSize"
        :total-records="totalRecords"
        :lazy="true"
        responsive-layout="scroll"
        sort-mode="single"
        class="list-page__table"
        data-key="id"
        @page="onPage"
        @sort="onSort"
      >
        <Column field="occurredAt" header="Time" sortable>
          <template #body="{ data: row }">
            <strong>{{ formatDateTime(row.occurredAt) }}</strong>
            <p class="table-muted">Request ID: {{ row.requestId || '-' }}</p>
          </template>
        </Column>
        <Column field="module" header="Module" sortable />
        <Column field="action" header="Action" sortable />
        <Column field="eventKey" header="Event">
          <template #body="{ data: row }">
            <strong>{{ eventLabel(row.eventKey) }}</strong>
            <p class="table-muted">{{ metadataPath(row) || row.eventKey }}</p>
          </template>
        </Column>
        <Column field="severity" header="Severity" sortable>
          <template #body="{ data: row }">
            <Tag :severity="severitySeverity(row.severity)" :value="row.severity" rounded />
          </template>
        </Column>
        <Column field="actorName" header="Actor" sortable>
          <template #body="{ data: row }">
            <strong>{{ actorDisplay(row) }}</strong>
            <p class="table-muted">{{ row.actorRole || '-' }}</p>
          </template>
        </Column>
        <Column header="Entity">
          <template #body="{ data: row }">
            <span>{{ entitySummary(row) }}</span>
          </template>
        </Column>
        <Column header="Details">
          <template #body="{ data: row }">
            <Button
              as="router-link"
              :to="`/admin/audit/${row.id}`"
              icon="pi pi-eye"
              text
              rounded
              severity="secondary"
              :aria-label="`Open audit event ${row.eventKey}`"
              :title="`Open audit event ${row.eventKey}`"
            />
          </template>
        </Column>
      </AppDataTable>

      <div v-if="!pending && !rows.length" class="surface-card list-page__empty">
        No audit events match the selected filters.
      </div>
    </section>
  </div>
</template>
