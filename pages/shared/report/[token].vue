<script setup lang="ts">
definePageMeta({
  layout: 'public',
  title: 'Shared Report',
})

type ReportColumn = { key: string; label: string; type?: string }
type SharedReportResponse = {
  ok: true
  data: {
    state: 'OK' | 'INVALID' | 'EXPIRED' | 'REVOKED' | 'CONSUMED'
    share: {
      ownerName: string
      flatLabel: string
      reportTypeLabel: string
      startDate: string
      endDate: string
      expiresAt: string
    } | null
    report: {
      title: string
      columns: ReportColumn[]
      rows: Record<string, unknown>[]
      summary: Record<string, number | string>
      chart: Array<{ label: string; value: number; color: string }>
      performanceMs: number
    } | null
  }
}

const route = useRoute()
const api = useApi()
const { formatMoney, formatDate, formatDateTime } = useFinanceFormatters()
const token = computed(() => String(route.params.token ?? ''))

const { data, pending } = await useAsyncData(`shared-report-${token.value}`, () =>
  api<SharedReportResponse>(`/api/reports/shares/access/${token.value}`),
)

const state = computed(() => data.value?.data.state ?? 'INVALID')
const report = computed(() => data.value?.data.report)
const share = computed(() => data.value?.data.share)
const maxChartValue = computed(() => Math.max(1, ...(report.value?.chart ?? []).map((item) => item.value)))
const downloadUrl = computed(() => `/api/reports/shares/access/${token.value}/download`)

const stateCopy: Record<string, { title: string; body: string }> = {
  INVALID: { title: 'Report link unavailable', body: 'This shared report link is invalid.' },
  EXPIRED: { title: 'Report link expired', body: 'This shared report link has passed its expiry time.' },
  REVOKED: { title: 'Report link revoked', body: 'This shared report link is no longer active.' },
  CONSUMED: { title: 'Report link consumed', body: 'This one-time shared report link has already been used.' },
}

const currentStateCopy = computed(() => stateCopy[state.value] ?? stateCopy.INVALID!)

const formatCell = (column: ReportColumn, value: unknown) => {
  if (column.type === 'money') return formatMoney(Number(value ?? 0))
  if (column.type === 'date') return formatDate(String(value ?? ''))
  if (column.type === 'datetime') return formatDateTime(String(value ?? ''))
  return value ?? '-'
}
</script>

<template>
  <div class="landing-page shared-report-page">
    <AppState v-if="pending" title="Loading report" message="Preparing the shared report." variant="loading" />

    <AppState
      v-else-if="state !== 'OK'"
      :title="currentStateCopy.title"
      :message="currentStateCopy.body"
      variant="permission"
      icon="pi pi-lock"
    />

    <template v-else-if="report && share">
      <section class="surface-card">
        <p class="eyebrow">{{ share.flatLabel }}</p>
        <h1>{{ report.title }}</h1>
        <p>
          {{ formatDate(share.startDate) }} - {{ formatDate(share.endDate) }} · Expires
          {{ formatDateTime(share.expiresAt) }}
        </p>
        <AppDocumentLink :href="downloadUrl" viewer-title="Shared report PDF" label="Download PDF" icon="pi pi-file-pdf" />
      </section>

      <div class="surface-grid">
        <section v-for="[key, value] in Object.entries(report.summary).slice(0, 4)" :key="key" class="surface-card">
          <p class="eyebrow">{{ key.replace(/([A-Z])/g, ' $1') }}</p>
          <h3>{{ typeof value === 'number' ? formatMoney(value) : value }}</h3>
        </section>
      </div>

      <section class="surface-card report-chart">
        <div v-for="item in report.chart" :key="item.label" class="report-chart__row">
          <span>{{ item.label }}</span>
          <div class="report-chart__track">
            <div class="report-chart__bar" :style="{ width: `${(item.value / maxChartValue) * 100}%`, background: item.color }" />
          </div>
          <strong>{{ formatMoney(item.value) }}</strong>
        </div>
      </section>

      <section class="surface-card">
        <AppDataTable :value="report.rows" responsive-layout="scroll">
          <Column v-for="column in report.columns" :key="column.key" :field="column.key" :header="column.label">
            <template #body="{ data: row }">
              {{ formatCell(column, row[column.key]) }}
            </template>
          </Column>
        </AppDataTable>
      </section>
    </template>
  </div>
</template>
