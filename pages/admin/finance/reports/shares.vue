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
const { reasonDialog, requestReason, acceptReason, cancelReason } = useAppReasonDialog()
const { formatDate, formatDateTime } = useFinanceFormatters()

const statusFilter = ref('ALL')
const query = computed(() => ({ status: statusFilter.value === 'ALL' ? undefined : statusFilter.value || undefined }))
const startOfMonthDate = () => {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
}

const endOfMonthDate = () => {
  const today = new Date()
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
}
const shareStartDate = startOfMonthDate()
const shareEndDate = endOfMonthDate()

const [
  sharesAsyncData,
  flatsAsyncData,
  ownersAsyncData,
] = await Promise.all([
  useAsyncData(
    'finance-report-shares',
    () => api<SharesResponse>('/api/reports/shares', { query: query.value }),
    { watch: [query] },
  ),
  useAsyncData('finance-report-share-flats', () =>
    api<FlatsResponse>('/api/admin/flats', { query: { pageSize: 1000 } }),
  ),
  useAsyncData('finance-report-share-owners', () =>
    api<ResidentsResponse>('/api/admin/residents', { query: { pageSize: 1000 } }),
  ),
])

const { data, pending, refresh } = sharesAsyncData
const { data: flatsData } = flatsAsyncData
const { data: ownersData } = ownersAsyncData

const shares = computed(() => data.value?.data ?? [])
const flats = computed(() => flatsData.value?.data.items ?? [])
const owners = computed(() => ownersData.value?.data.items ?? [])
const statusOptions = [
  { label: 'All', value: 'ALL' },
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
  const reason = await requestReason({
    header: 'Revoke shared report?',
    message: `Revoke the ${share.reportTypeLabel} link for ${share.ownerName}? The current link will stop working.`,
    acceptLabel: 'Revoke',
    acceptSeverity: 'danger',
    placeholder: 'Reason for revocation',
  })

  if (!reason) {
    return
  }

  await api(`/api/reports/shares/${share.id}`, {
    method: 'DELETE',
    body: { reason },
  })
  toast.add({ severity: 'success', summary: 'Revoked', life: 10000 })
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
    life: 10000,
  })
  await refresh()
}

const copyShare = async (share: SharedReport) => {
  const response = await api<RegenerateResponse>(`/api/reports/shares/${share.id}/copy`, {
    method: 'POST',
  })
  await navigator.clipboard?.writeText(response.data.link)
  toast.add({
    severity: response.data.deliveryFailure ? 'warn' : 'success',
    summary: 'Shared link copied',
    detail: response.data.deliveryFailure ?? 'Copied to clipboard',
    life: 10000,
  })
  await refresh()
}

const sendShareEmail = async (share: SharedReport) => {
  const response = await api<RegenerateResponse>(`/api/reports/shares/${share.id}/send`, {
    method: 'POST',
  })
  toast.add({
    severity: response.data.deliveryFailure ? 'warn' : 'success',
    summary: 'Report sent',
    detail: response.data.deliveryFailure ?? 'Report link has been sent to owner email.',
    life: 10000,
  })
  await refresh()
}

const removeShare = async (share: SharedReport) => {
  const reason = await requestReason({
    header: 'Delete shared report?',
    message: `Delete the ${share.reportTypeLabel} link for ${share.ownerName}? This cannot be undone.`,
    acceptLabel: 'Delete',
    acceptSeverity: 'danger',
    placeholder: 'Reason for deletion',
  })

  if (reason === null) {
    return
  }

  await api(`/api/reports/shares/${share.id}/hard`, {
    method: 'DELETE',
    body: { reason },
  })
  toast.add({ severity: 'success', summary: 'Deleted', detail: 'Shared report deleted.', life: 10000 })
  await refresh()
}
</script>

<template>
  <div class="landing-page shared-report-admin-page">
    <SharedReportLinkPanel :owners="owners" :flats="flats" :start-date="shareStartDate" :end-date="shareEndDate" @created="refresh" />

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

      <AppDataTable :value="shares" :loading="pending" responsive-layout="scroll" class="list-page__table">
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
              <Button icon="pi pi-refresh" severity="secondary" outlined title="Regenerate" @click="regenerate(row)" />
              <Button icon="pi pi-envelope" severity="secondary" outlined title="Send email" @click="sendShareEmail(row)" />
              <Button icon="pi pi-copy" severity="secondary" outlined title="Copy" @click="copyShare(row)" />
              <Button icon="pi pi-trash" severity="danger" outlined title="Delete" @click="removeShare(row)" />
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
      </AppDataTable>
    </section>

    <AppReasonDialog
      v-model:visible="reasonDialog.visible"
      v-model:reason="reasonDialog.reason"
      :header="reasonDialog.header"
      :message="reasonDialog.message"
      :accept-label="reasonDialog.acceptLabel"
      :accept-severity="reasonDialog.acceptSeverity"
      :placeholder="reasonDialog.placeholder"
      @accept="acceptReason"
      @cancel="cancelReason"
    />
  </div>
</template>
