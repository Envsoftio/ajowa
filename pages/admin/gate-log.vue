<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Gate Log',
})

type GateLogResponse = {
  ok: true
  data: {
    items: {
      id: string
      scannedAt: string
      guardName: string | null
      residentName: string | null
      flatLabel: string | null
      result: string
      reason: string | null
      gateName: string | null
    }[]
  }
}

const api = useApi()
const filters = reactive({
  result: '',
  guardId: '',
  residentId: '',
  flatId: '',
  from: '',
  to: '',
  reason: '',
})

const queryString = computed(() => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value)
  }
  return params.toString()
})

const { data, pending, refresh } = await useAsyncData(
  'admin-gate-log',
  () => api<GateLogResponse>(`/api/admin/gate-log${queryString.value ? `?${queryString.value}` : ''}`),
  { watch: [queryString] },
)

const rows = computed(() => data.value?.data.items ?? [])
const exportUrl = (format: 'csv' | 'excel' | 'pdf') =>
  `/api/admin/gate-log?${queryString.value ? `${queryString.value}&` : ''}export=${format}`
</script>

<template>
  <div class="admin-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <p class="eyebrow">Access audit</p>
          <h1>Gate log</h1>
          <p>Every allowed, blocked, invalid, expired, and revoked scan is recorded here.</p>
        </div>
        <div class="list-page__exports">
          <a :href="exportUrl('excel')" target="_blank" rel="noopener">
            <Button label="Excel" icon="pi pi-file-excel" severity="secondary" outlined />
          </a>
          <a :href="exportUrl('pdf')" target="_blank" rel="noopener">
            <Button label="PDF" icon="pi pi-file-pdf" severity="secondary" outlined />
          </a>
          <a :href="exportUrl('csv')" target="_blank" rel="noopener">
            <Button label="CSV" icon="pi pi-download" severity="secondary" outlined />
          </a>
          <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined @click="() => refresh()" />
        </div>
      </header>

      <div class="filter-toolbar">
        <Dropdown
          v-model="filters.result"
          :options="['', 'GRANTED', 'DENIED', 'EXPIRED', 'REVOKED', 'INVALID']"
          placeholder="Result"
        />
        <InputText v-model="filters.from" type="date" />
        <InputText v-model="filters.to" type="date" />
        <InputText v-model="filters.guardId" placeholder="Guard user ID" />
        <InputText v-model="filters.residentId" placeholder="Resident user ID" />
        <InputText v-model="filters.flatId" placeholder="Flat ID" />
        <InputText v-model="filters.reason" placeholder="Reason contains" />
      </div>

      <AppSkeletonState v-if="pending" />
      <DataTable v-else :value="rows" responsive-layout="scroll" class="list-page__table">
        <Column field="scannedAt" header="Time">
          <template #body="{ data: row }">{{ new Date(row.scannedAt).toLocaleString('en-IN') }}</template>
        </Column>
        <Column field="guardName" header="Guard" />
        <Column field="residentName" header="Resident" />
        <Column field="flatLabel" header="Flat" />
        <Column field="result" header="Result">
          <template #body="{ data: row }">
            <Tag :severity="row.result === 'GRANTED' ? 'success' : 'danger'" :value="row.result" rounded />
          </template>
        </Column>
        <Column field="reason" header="Reason" />
      </DataTable>
    </section>
  </div>
</template>
