<script setup lang="ts">
import type { FlatSummary, ResidentSummary } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Shared Reports',
})

type SharedReport = {
  id: string
  ownerName: string
  ownerEmail: string
  flatLabel: string
  reportTypeLabel: string
  startDate: string
  endDate: string
  createdByName: string | null
  createdAt: string
  expiresAt: string
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'CONSUMED'
  accessCount: number
  lastAccessedAt: string | null
  deliveryState: string
  deliveryFailure: string | null
}
type SharesResponse = { ok: true; data: SharedReport[] }
type FlatsResponse = { ok: true; data: { items: FlatSummary[] } }
type ResidentsResponse = { ok: true; data: { items: ResidentSummary[] } }
type RegenerateResponse = { ok: true; data: { link: string; deliveryFailure: string | null } }

const api = useApi()
const toast = useToast()
const { formatDate, formatDateTime } = useFinanceFormatters()

const statusFilter = ref('')
const query = computed(() => ({ status: statusFilter.value || undefined }))

const { data, pending, refresh } = await useAsyncData(
  'finance-report-shares',
  () => api<SharesResponse>('/api/reports/shares', { query: query.value }),
  { watch: [query] },
)
const { data: flatsData } = await useAsyncData('finance-report-share-flats', () =>
  api<FlatsResponse>('/api/admin/flats', { query: { pageSize: 300 } }),
)
const { data: ownersData } = await useAsyncData('finance-report-share-owners', () =>
  api<ResidentsResponse>('/api/admin/residents', { query: { pageSize: 300 } }),
)

const shares = computed(() => data.value?.data ?? [])
const flats = computed(() => flatsData.value?.data.items ?? [])
const owners = computed(() => ownersData.value?.data.items ?? [])
const statusOptions = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Expired', value: 'EXPIRED' },
  { label: 'Revoked', value: 'REVOKED' },
  { label: 'Consumed', value: 'CONSUMED' },
]

const statusSeverity = (status: SharedReport['status']) => {
  if (status === 'ACTIVE') return 'success'
  if (status === 'EXPIRED') return 'warning'
  if (status === 'CONSUMED') return 'info'
  return 'danger'
}

const revoke = async (share: SharedReport) => {
  const reason = window.prompt(`Reason for revoking ${share.reportTypeLabel}?`)
  await api(`/api/reports/shares/${share.id}`, {
    method: 'DELETE',
    body: { reason: reason || null },
  })
  toast.add({ severity: 'success', summary: 'Revoked', life: 3000 })
  await refresh()
}

const regenerate = async (share: SharedReport) => {
  const response = await api<RegenerateResponse>(`/api/reports/shares/${share.id}/resend`, {
    method: 'POST',
  })
  await navigator.clipboard?.writeText(response.data.link)
  toast.add({
    severity: response.data.deliveryFailure ? 'warn' : 'success',
    summary: 'New link created',
    detail: response.data.deliveryFailure ?? 'Copied to clipboard',
    life: 4500,
  })
  await refresh()
}
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Shared reports</h1>
          <p>Owner report links, access state, delivery status, and revocation controls.</p>
        </div>
        <div class="list-page__exports">
          <Button as="router-link" to="/admin/finance/reports" label="Reports" icon="pi pi-chart-bar" severity="secondary" outlined />
          <Select v-model="statusFilter" :options="statusOptions" option-label="label" option-value="value" />
        </div>
      </header>

      <DataTable :value="shares" :loading="pending" responsive-layout="scroll" class="list-page__table">
        <Column field="ownerName" header="Owner">
          <template #body="{ data: row }">
            <div class="report-owner-cell">
              <strong>{{ row.ownerName }}</strong>
              <span>{{ row.ownerEmail }}</span>
            </div>
          </template>
        </Column>
        <Column field="flatLabel" header="Flat" />
        <Column field="reportTypeLabel" header="Report" />
        <Column header="Period">
          <template #body="{ data: row }">{{ formatDate(row.startDate) }} - {{ formatDate(row.endDate) }}</template>
        </Column>
        <Column field="createdByName" header="Creator" />
        <Column header="Created">
          <template #body="{ data: row }">{{ formatDateTime(row.createdAt) }}</template>
        </Column>
        <Column header="Expiry">
          <template #body="{ data: row }">{{ formatDateTime(row.expiresAt) }}</template>
        </Column>
        <Column field="status" header="Status">
          <template #body="{ data: row }">
            <Tag :value="row.status" :severity="statusSeverity(row.status)" />
          </template>
        </Column>
        <Column field="accessCount" header="Access" />
        <Column header="Last access">
          <template #body="{ data: row }">{{ formatDateTime(row.lastAccessedAt) }}</template>
        </Column>
        <Column field="deliveryState" header="Delivery">
          <template #body="{ data: row }">
            <div class="report-owner-cell">
              <strong>{{ row.deliveryState }}</strong>
              <span v-if="row.deliveryFailure">{{ row.deliveryFailure }}</span>
            </div>
          </template>
        </Column>
        <Column header="Actions">
          <template #body="{ data: row }">
            <div class="list-page__exports">
              <Button icon="pi pi-send" severity="secondary" outlined title="Regenerate" @click="regenerate(row)" />
              <Button
                icon="pi pi-ban"
                severity="danger"
                outlined
                title="Revoke"
                :disabled="row.status !== 'ACTIVE'"
                @click="revoke(row)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <SharedReportLinkPanel :owners="owners" :flats="flats" :start-date="new Date().toISOString().slice(0, 10)" :end-date="new Date().toISOString().slice(0, 10)" @created="refresh" />
  </div>
</template>
