<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Audit Detail',
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
  targetUserId: string | null
  targetName: string | null
  requestId: string | null
  ipAddress: string | null
  userAgent: string | null
  metadata: Record<string, unknown>
  beforeState: Record<string, unknown> | null
  afterState: Record<string, unknown> | null
  entities: AuditEntity[]
}

type AuditDetailResponse = {
  ok: true
  data: AuditEntry
}

const route = useRoute()
const api = useApi()
const auditId = computed(() => String(route.params.id ?? ''))

const { data, pending } = await useAsyncData(
  () => `admin-audit-detail:${auditId.value}`,
  () => api<AuditDetailResponse>(`/api/admin/audit/${auditId.value}`),
  { watch: [auditId] },
)

const entry = computed(() => data.value?.data ?? null)

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

const actorDisplay = computed(() => {
  if (!entry.value) return '-'
  return entry.value.actorName ?? (entry.value.actorUserId ? 'System user' : 'System')
})

const fieldLabels: Record<string, string> = {
  accessRecomputed: 'Access recomputed',
  accessRevoked: 'Access revoked',
  billingPeriodId: 'Billing period',
  billingPeriodLabel: 'Billing period',
  requestedDueCount: 'Requested due count',
  recalculatedDueCount: 'Recalculated due count',
  reason: 'Reason',
  reportType: 'Report type',
  routeParams: 'Route parameters',
  statusCode: 'Status code',
}

const humanizeField = (key: string) =>
  fieldLabels[key] ??
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const formatAuditValue = (
  key: string,
  value: unknown,
  currentRecord: Record<string, unknown>,
) => {
  if (value === null || value === undefined || value === '') return '-'

  if (key === 'billingPeriodId') {
    const label = currentRecord.billingPeriodLabel ?? entry.value?.metadata.billingPeriodLabel
    if (typeof label === 'string' && label) {
      return `${label} (${value})`
    }
  }

  if (typeof value === 'number') return value.toLocaleString('en-IN')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '-'
  if (isRecord(value)) return JSON.stringify(value, null, 2)

  return String(value)
}

const auditRows = (value: Record<string, unknown> | null | undefined) => {
  if (!value) return []

  return Object.entries(value)
    .filter(([key]) => !(key === 'billingPeriodId' && typeof value.billingPeriodLabel === 'string'))
    .map(([key, fieldValue]) => ({
      key,
      label: humanizeField(key),
      value: formatAuditValue(key, fieldValue, value),
      multiline: isRecord(fieldValue),
    }))
}
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <p class="eyebrow">System audit</p>
          <h1>Audit detail</h1>
          <p v-if="entry">{{ eventLabel(entry.eventKey) }}</p>
        </div>
        <div class="list-page__exports">
          <Button as="router-link" to="/admin/audit" label="Back to audit log" icon="pi pi-arrow-left" severity="secondary" outlined />
        </div>
      </header>

      <div v-if="pending" class="surface-card list-page__empty">
        Loading audit event...
      </div>

      <div v-else-if="entry" class="surface-grid">
        <section class="surface-card">
          <p class="eyebrow">When</p>
          <h3>{{ formatDateTime(entry.occurredAt) }}</h3>
          <p>Request ID: {{ entry.requestId || '-' }}</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Action</p>
          <h3>{{ entry.action }}</h3>
          <p>{{ entry.module }}</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Severity</p>
          <h3>
            <Tag :severity="severitySeverity(entry.severity)" :value="entry.severity" rounded />
          </h3>
          <p>{{ eventLabel(entry.eventKey) }}</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Actor</p>
          <h3>{{ actorDisplay }}</h3>
          <p>{{ entry.actorRole || entry.actorUserId || '-' }}</p>
        </section>
      </div>

      <div v-if="entry" class="surface-grid">
        <section class="surface-card">
          <p class="eyebrow">Technical event key</p>
          <h3>{{ entry.eventKey }}</h3>
          <p>Used internally for filtering and support.</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Target</p>
          <h3>{{ entry.targetName || '-' }}</h3>
          <p>{{ entry.targetUserId || 'No target user' }}</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Request</p>
          <h3>{{ entry.ipAddress || '-' }}</h3>
          <p>{{ entry.userAgent || 'No user agent' }}</p>
        </section>
      </div>

      <div v-if="entry" class="list-page__toolbar">
        <section class="surface-card">
          <p class="eyebrow">Related entities</p>
          <AppDataTable :value="entry.entities" responsive-layout="scroll" data-key="entityId">
            <Column field="entityTable" header="Table" />
            <Column field="entityId" header="ID" />
            <Column field="entityLabel" header="Label">
              <template #body="{ data: row }">
                {{ row.entityLabel || '-' }}
              </template>
            </Column>
          </AppDataTable>
        </section>
      </div>

      <div v-if="entry" class="surface-grid">
        <section class="surface-card">
          <p class="eyebrow">Metadata</p>
          <dl v-if="auditRows(entry.metadata).length" class="audit-fields">
            <div v-for="row in auditRows(entry.metadata)" :key="row.key" class="audit-field">
              <dt>{{ row.label }}</dt>
              <dd :class="{ 'audit-field__multiline': row.multiline }">{{ row.value }}</dd>
            </div>
          </dl>
          <p v-else>-</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Before</p>
          <dl v-if="auditRows(entry.beforeState).length" class="audit-fields">
            <div v-for="row in auditRows(entry.beforeState)" :key="row.key" class="audit-field">
              <dt>{{ row.label }}</dt>
              <dd :class="{ 'audit-field__multiline': row.multiline }">{{ row.value }}</dd>
            </div>
          </dl>
          <p v-else>-</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">After</p>
          <dl v-if="auditRows(entry.afterState).length" class="audit-fields">
            <div v-for="row in auditRows(entry.afterState)" :key="row.key" class="audit-field">
              <dt>{{ row.label }}</dt>
              <dd :class="{ 'audit-field__multiline': row.multiline }">{{ row.value }}</dd>
            </div>
          </dl>
          <p v-else>-</p>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.audit-fields {
  display: grid;
  gap: 0.75rem;
  margin: 0;
}

.audit-field {
  display: grid;
  gap: 0.2rem;
}

.audit-field dt {
  color: var(--text-color-secondary);
  font-size: 0.8rem;
  font-weight: 600;
  margin: 0;
}

.audit-field dd {
  margin: 0;
  word-break: break-word;
}

.audit-field__multiline {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: pre-wrap;
}
</style>
