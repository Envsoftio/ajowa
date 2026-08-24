<script setup lang="ts">
import {
  priorityLabels,
  serviceRequestStatuses,
  statusLabels,
} from '~/shared/service-requests'
import type {
  ResidentServiceRequestStatisticsResponse,
  ServiceLocationType,
  ServicePriority,
  ServiceRequestStatus,
} from '~/types/domain'

definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'Service Request Statistics',
})

const api = useApi()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const firstQueryValue = (value: unknown) =>
  typeof value === 'string'
    ? value
    : Array.isArray(value) && typeof value[0] === 'string'
      ? value[0]
      : ''

const toDateInput = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const today = toDateInput(new Date())
const defaultStart = new Date()
defaultStart.setDate(defaultStart.getDate() - 89)

const filters = reactive({
  startDate:
    firstQueryValue(route.query.startDate) || toDateInput(defaultStart),
  endDate: firstQueryValue(route.query.endDate) || today,
  status: firstQueryValue(route.query.status) as ServiceRequestStatus | '',
  category: firstQueryValue(route.query.category),
  departmentId: firstQueryValue(route.query.departmentId),
  priority: firstQueryValue(route.query.priority) as ServicePriority | '',
  locationType: firstQueryValue(route.query.locationType) as
    | ServiceLocationType
    | '',
})

const appliedFilters = ref({ ...filters })

const loadStatistics = () =>
  api<{ ok: true; data: ResidentServiceRequestStatisticsResponse }>(
    '/api/my/service-request-statistics',
    {
      query: Object.fromEntries(
        Object.entries(appliedFilters.value).filter(([, value]) =>
          Boolean(value),
        ),
      ),
    },
  )

const { data, pending, refresh } = await useResidentAsyncData(
  'resident-service-request-statistics',
  loadStatistics,
  { watch: [appliedFilters] },
)

const response = computed(() => data.value?.data)
const statistics = computed(() =>
  response.value?.enabled ? response.value.statistics : null,
)
const enabled = computed(() => response.value?.enabled !== false)
const summary = computed(() => statistics.value?.summary)
const options = computed(() => statistics.value?.options)

const statusOptions = serviceRequestStatuses.map((status) => ({
  label: statusLabels[status],
  value: status,
}))
const priorityOptions = (
  ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'] as ServicePriority[]
).map((priority) => ({ label: priorityLabels[priority], value: priority }))
const locationOptions: Array<{ label: string; value: ServiceLocationType }> = [
  { label: 'Flat', value: 'FLAT' },
  { label: 'Common area', value: 'COMMON_AREA' },
  { label: 'Society asset', value: 'SOCIETY_ASSET' },
]
const locationLabels: Record<ServiceLocationType, string> = Object.fromEntries(
  locationOptions.map((option) => [option.value, option.label]),
) as Record<ServiceLocationType, string>

const applyFilters = async () => {
  if (!filters.startDate || !filters.endDate) {
    toast.add({
      severity: 'warn',
      summary: 'Choose a date range',
      detail: 'Start date and end date are required.',
      life: 10000,
    })
    return
  }

  if (filters.endDate < filters.startDate) {
    toast.add({
      severity: 'warn',
      summary: 'Check date range',
      detail: 'End date must be on or after start date.',
      life: 10000,
    })
    return
  }

  appliedFilters.value = { ...filters }
  await router.replace({
    query: Object.fromEntries(
      Object.entries(filters).filter(([, value]) => Boolean(value)),
    ),
  })
}

const resetFilters = () => {
  filters.startDate = toDateInput(defaultStart)
  filters.endDate = today
  filters.status = ''
  filters.category = ''
  filters.departmentId = ''
  filters.priority = ''
  filters.locationType = ''
  void applyFilters()
}

const useRecentRange = (days: number) => {
  const start = new Date()
  start.setDate(start.getDate() - (days - 1))
  filters.startDate = toDateInput(start)
  filters.endDate = today
  void applyFilters()
}

const formatNumber = (value: number | null | undefined) =>
  new Intl.NumberFormat('en-IN').format(value ?? 0)

const formatMetricDuration = (
  value: number | null | undefined,
  unit: 'minutes' | 'hours',
) => {
  if (value == null) return 'Not available'
  if (unit === 'minutes' && value >= 60) return `${(value / 60).toFixed(1)} hr`
  if (unit === 'hours' && value >= 24) return `${(value / 24).toFixed(1)} days`
  return `${value.toFixed(1)} ${unit === 'minutes' ? 'min' : 'hr'}`
}

const kpiCards = computed(() => [
  {
    label: 'Opened',
    value: formatNumber(summary.value?.openedDuringPeriod),
    detail: 'Created in selected period',
    tone: 'info',
  },
  {
    label: 'Resolved',
    value: formatNumber(summary.value?.resolvedDuringPeriod),
    detail: 'Resolved in selected period',
    tone: 'success',
  },
  {
    label: 'Closed',
    value: formatNumber(summary.value?.closedDuringPeriod),
    detail: 'Closed in selected period',
    tone: 'success',
  },
  {
    label: 'Active now',
    value: formatNumber(summary.value?.activeNow),
    detail: 'Current matching backlog',
    tone: 'info',
  },
  {
    label: 'Overdue now',
    value: formatNumber(summary.value?.overdueNow),
    detail: 'Active and past SLA',
    tone: 'danger',
  },
  {
    label: 'Reopened',
    value: formatNumber(summary.value?.reopenedDuringPeriod),
    detail: 'Reopened in selected period',
    tone: 'warn',
  },
  {
    label: 'Resolution rate',
    value: `${summary.value?.resolutionRate ?? 0}%`,
    detail: 'Opened cohort now resolved or closed',
    tone: 'success',
  },
  {
    label: 'SLA breached',
    value: formatNumber(summary.value?.slaBreachedOpenedDuringPeriod),
    detail: 'Among tickets opened in period',
    tone: 'danger',
  },
])

const serviceLevels = computed(() => [
  {
    label: 'Average first response',
    value: formatMetricDuration(
      summary.value?.averageFirstResponseMinutes,
      'minutes',
    ),
  },
  {
    label: 'Average resolution time',
    value: formatMetricDuration(summary.value?.averageResolutionHours, 'hours'),
  },
])

const trendMax = computed(() =>
  Math.max(
    1,
    ...(statistics.value?.trend.flatMap((item) => [
      item.opened,
      item.resolved,
      item.closed,
    ]) ?? [0]),
  ),
)
const barHeight = (value: number) =>
  `${Math.max((value / trendMax.value) * 100, value ? 5 : 0)}%`

const formatPeriodLabel = (value: string) => {
  const date = new Date(`${value}T00:00:00`)
  return new Intl.DateTimeFormat('en-IN', {
    day: statistics.value?.granularity === 'MONTH' ? undefined : 'numeric',
    month: 'short',
    year: statistics.value?.granularity === 'MONTH' ? '2-digit' : undefined,
  }).format(date)
}

const statusMax = computed(() =>
  Math.max(
    1,
    ...(statistics.value?.statusBreakdown.map((item) => item.count) ?? [0]),
  ),
)
const breakdownWidth = (value: number, maximum: number) =>
  `${Math.max((value / maximum) * 100, value ? 3 : 0)}%`

const hasOpenedCohort = computed(
  () => (summary.value?.openedDuringPeriod ?? 0) > 0,
)
</script>

<template>
  <div class="landing-page service-statistics">
    <header class="hero-panel service-statistics__hero">
      <div>
        <p class="eyebrow">Service transparency</p>
        <h1>Service request statistics</h1>
        <p>
          Review anonymized service performance across every ticket in your
          society.
        </p>
      </div>
      <Button
        label="My requests"
        icon="pi pi-ticket"
        severity="secondary"
        outlined
        as="a"
        href="/my/service-requests"
      />
    </header>

    <AppSkeletonState v-if="pending && !response" />

    <AppState
      v-else-if="!enabled"
      variant="permission"
      title="Statistics are not published"
      message="Your society administrator has not enabled resident service statistics."
    />

    <template v-else>
      <section
        class="surface-card service-statistics__filters"
        aria-labelledby="statistics-filters-title"
      >
        <div class="service-statistics__section-heading">
          <div>
            <p class="eyebrow">Filters</p>
            <h2 id="statistics-filters-title">Choose what to compare</h2>
          </div>
          <div class="service-statistics__range-actions">
            <Button
              label="30 days"
              size="small"
              text
              @click="useRecentRange(30)"
            />
            <Button
              label="90 days"
              size="small"
              text
              @click="useRecentRange(90)"
            />
            <Button
              label="1 year"
              size="small"
              text
              @click="useRecentRange(365)"
            />
          </div>
        </div>

        <div class="service-statistics__filter-grid">
          <label>
            <span>Start date</span>
            <InputText
              v-model="filters.startDate"
              type="date"
              :max="filters.endDate || today"
            />
          </label>
          <label>
            <span>End date</span>
            <InputText
              v-model="filters.endDate"
              type="date"
              :min="filters.startDate"
              :max="today"
            />
          </label>
          <label>
            <span>Status</span>
            <Select
              v-model="filters.status"
              :options="statusOptions"
              option-label="label"
              option-value="value"
              show-clear
              placeholder="All statuses"
            />
          </label>
          <label>
            <span>Category</span>
            <Select
              v-model="filters.category"
              :options="options?.categories ?? []"
              show-clear
              placeholder="All categories"
            />
          </label>
          <label>
            <span>Department</span>
            <Select
              v-model="filters.departmentId"
              :options="options?.departments ?? []"
              option-label="name"
              option-value="id"
              show-clear
              placeholder="All departments"
            />
          </label>
          <label>
            <span>Priority</span>
            <Select
              v-model="filters.priority"
              :options="priorityOptions"
              option-label="label"
              option-value="value"
              show-clear
              placeholder="All priorities"
            />
          </label>
          <label>
            <span>Location</span>
            <Select
              v-model="filters.locationType"
              :options="locationOptions"
              option-label="label"
              option-value="value"
              show-clear
              placeholder="All locations"
            />
          </label>
        </div>

        <div class="service-statistics__filter-actions">
          <Button
            label="Apply filters"
            icon="pi pi-filter"
            :loading="pending"
            @click="applyFilters"
          />
          <Button
            label="Reset"
            icon="pi pi-times"
            severity="secondary"
            outlined
            @click="resetFilters"
          />
          <Button
            label="Refresh"
            icon="pi pi-refresh"
            severity="secondary"
            text
            @click="() => refresh()"
          />
        </div>
      </section>

      <template v-if="statistics">
        <section
          class="service-statistics__kpis"
          aria-label="Service request key statistics"
        >
          <article
            v-for="card in kpiCards"
            :key="card.label"
            class="surface-card service-statistics__kpi"
            :data-tone="card.tone"
          >
            <p>{{ card.label }}</p>
            <strong>{{ card.value }}</strong>
            <small>{{ card.detail }}</small>
          </article>
        </section>

        <section class="service-statistics__service-levels">
          <article
            v-for="item in serviceLevels"
            :key="item.label"
            class="surface-card"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        </section>

        <section class="surface-card service-statistics__chart-card">
          <div class="service-statistics__section-heading">
            <div>
              <p class="eyebrow">Activity trend</p>
              <h2>Opened, resolved, and closed</h2>
              <p>
                {{ statistics.filters.startDate }} to
                {{ statistics.filters.endDate }} ·
                {{ statistics.granularity.toLowerCase() }} buckets
              </p>
            </div>
            <div class="service-statistics__legend" aria-label="Chart legend">
              <span><i class="legend-opened" />Opened</span>
              <span><i class="legend-resolved" />Resolved</span>
              <span><i class="legend-closed" />Closed</span>
            </div>
          </div>

          <div
            class="service-statistics__trend"
            role="img"
            aria-label="Service request activity bar chart"
          >
            <div
              v-for="item in statistics.trend"
              :key="item.periodStart"
              class="service-statistics__trend-group"
            >
              <div class="service-statistics__bars">
                <span
                  class="bar-opened"
                  :style="{ height: barHeight(item.opened) }"
                  :title="`${item.opened} opened`"
                />
                <span
                  class="bar-resolved"
                  :style="{ height: barHeight(item.resolved) }"
                  :title="`${item.resolved} resolved`"
                />
                <span
                  class="bar-closed"
                  :style="{ height: barHeight(item.closed) }"
                  :title="`${item.closed} closed`"
                />
              </div>
              <small>{{ formatPeriodLabel(item.periodStart) }}</small>
            </div>
          </div>
        </section>

        <section class="service-statistics__breakdown-grid">
          <article class="surface-card">
            <div class="service-statistics__section-heading">
              <div>
                <p class="eyebrow">Opened cohort</p>
                <h2>Current status</h2>
              </div>
            </div>
            <div
              v-if="statistics.statusBreakdown.length"
              class="service-statistics__bar-list"
            >
              <div
                v-for="item in statistics.statusBreakdown"
                :key="item.status"
              >
                <div>
                  <span>{{ statusLabels[item.status] }}</span
                  ><strong>{{ item.count }}</strong>
                </div>
                <span class="service-statistics__bar-track"
                  ><i :style="{ width: breakdownWidth(item.count, statusMax) }"
                /></span>
              </div>
            </div>
            <AppState
              v-else
              variant="empty"
              title="No status data"
              message="No tickets were opened for these filters."
            />
          </article>

          <article class="surface-card">
            <div class="service-statistics__section-heading">
              <div>
                <p class="eyebrow">Opened cohort</p>
                <h2>Priority and location</h2>
              </div>
            </div>
            <div class="service-statistics__compact-breakdowns">
              <div>
                <h3>Priority</h3>
                <p
                  v-for="item in statistics.priorityBreakdown"
                  :key="item.priority"
                >
                  <span>{{ priorityLabels[item.priority] }}</span
                  ><strong>{{ item.count }}</strong>
                </p>
                <small v-if="!statistics.priorityBreakdown.length"
                  >No data</small
                >
              </div>
              <div>
                <h3>Location</h3>
                <p
                  v-for="item in statistics.locationBreakdown"
                  :key="item.locationType"
                >
                  <span>{{ locationLabels[item.locationType] }}</span
                  ><strong>{{ item.count }}</strong>
                </p>
                <small v-if="!statistics.locationBreakdown.length"
                  >No data</small
                >
              </div>
            </div>
          </article>
        </section>

        <section class="surface-card service-statistics__table-card">
          <div class="service-statistics__section-heading">
            <div>
              <p class="eyebrow">Service areas</p>
              <h2>Category performance</h2>
            </div>
          </div>
          <div class="service-statistics__table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Opened</th>
                  <th>Resolved</th>
                  <th>Active now</th>
                  <th>Overdue now</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in statistics.categoryBreakdown"
                  :key="item.category"
                >
                  <th>{{ item.category }}</th>
                  <td>{{ item.opened }}</td>
                  <td>{{ item.resolved }}</td>
                  <td>{{ item.active }}</td>
                  <td>{{ item.overdue }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <AppState
            v-if="!statistics.categoryBreakdown.length"
            variant="empty"
            title="No category data"
            message="No matching service activity was found."
          />
        </section>

        <section class="surface-card service-statistics__table-card">
          <div class="service-statistics__section-heading">
            <div>
              <p class="eyebrow">Operations</p>
              <h2>Department performance</h2>
            </div>
          </div>
          <div class="service-statistics__table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Opened</th>
                  <th>Resolved</th>
                  <th>Active now</th>
                  <th>Overdue now</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in statistics.departmentBreakdown"
                  :key="item.departmentId ?? 'unassigned'"
                >
                  <th>{{ item.departmentName }}</th>
                  <td>{{ item.opened }}</td>
                  <td>{{ item.resolved }}</td>
                  <td>{{ item.active }}</td>
                  <td>{{ item.overdue }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <AppState
            v-if="!statistics.departmentBreakdown.length"
            variant="empty"
            title="No department data"
            message="No matching service activity was found."
          />
        </section>

        <section
          v-if="!hasOpenedCohort"
          class="surface-card service-statistics__note"
        >
          <i class="pi pi-info-circle" aria-hidden="true" />
          <p>
            There were no tickets opened in this period. Current backlog and
            period resolution totals can still include tickets opened earlier.
          </p>
        </section>

        <section class="surface-card service-statistics__privacy">
          <i class="pi pi-shield" aria-hidden="true" />
          <div>
            <strong>Privacy protected</strong>
            <p>
              Results include every society ticket as aggregate counts.
              Requester names, flat numbers, descriptions, comments,
              attachments, assignees, and internal ticket content are never
              included.
            </p>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.service-statistics {
  display: grid;
  gap: 1rem;
}
.service-statistics__hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.service-statistics__hero h1,
.service-statistics__hero p {
  margin: 0;
}
.service-statistics__hero p:last-child {
  margin-top: 0.45rem;
  max-width: 52rem;
}
.service-statistics__filters,
.service-statistics__chart-card,
.service-statistics__table-card {
  padding: 1.15rem;
}
.service-statistics__section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}
.service-statistics__section-heading h2,
.service-statistics__section-heading p {
  margin: 0;
}
.service-statistics__section-heading p:last-child {
  margin-top: 0.25rem;
  color: var(--text-color-secondary);
}
.service-statistics__range-actions,
.service-statistics__filter-actions,
.service-statistics__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.service-statistics__filter-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}
.service-statistics__filter-grid label {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
}
.service-statistics__filter-grid label > span {
  font-size: 0.85rem;
  font-weight: 700;
}
.service-statistics__filter-grid :deep(.p-select),
.service-statistics__filter-grid :deep(.p-inputtext) {
  width: 100%;
}
.service-statistics__filter-actions {
  margin-top: 1rem;
}
.service-statistics__kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.85rem;
}
.service-statistics__kpi {
  display: grid;
  gap: 0.3rem;
  padding: 1rem;
  border-top: 3px solid var(--p-primary-color);
}
.service-statistics__kpi[data-tone='success'] {
  border-top-color: var(--p-green-500);
}
.service-statistics__kpi[data-tone='warn'] {
  border-top-color: var(--p-orange-500);
}
.service-statistics__kpi[data-tone='danger'] {
  border-top-color: var(--p-red-500);
}
.service-statistics__kpi p,
.service-statistics__kpi small {
  margin: 0;
  color: var(--text-color-secondary);
}
.service-statistics__kpi strong {
  font-size: clamp(1.5rem, 3vw, 2.2rem);
}
.service-statistics__service-levels {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}
.service-statistics__service-levels article {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
}
.service-statistics__service-levels strong {
  font-size: 1.2rem;
}
.service-statistics__legend span {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
}
.service-statistics__legend i {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 0.2rem;
}
.legend-opened,
.bar-opened {
  background: var(--p-blue-500);
}
.legend-resolved,
.bar-resolved {
  background: var(--p-green-500);
}
.legend-closed,
.bar-closed {
  background: var(--p-slate-500);
}
.service-statistics__trend {
  display: flex;
  align-items: stretch;
  gap: 0.65rem;
  height: 18rem;
  overflow-x: auto;
  padding: 1rem 0.25rem 0;
  border-bottom: 1px solid var(--surface-border);
}
.service-statistics__trend-group {
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 0.45rem;
  flex: 1 0 2.3rem;
  min-width: 2.3rem;
  text-align: center;
}
.service-statistics__bars {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  min-height: 0;
}
.service-statistics__bars span {
  width: min(28%, 0.8rem);
  min-height: 0;
  border-radius: 0.25rem 0.25rem 0 0;
  transition: height 0.2s ease;
}
.service-statistics__trend-group small {
  white-space: nowrap;
  font-size: 0.68rem;
  color: var(--text-color-secondary);
}
.service-statistics__breakdown-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
.service-statistics__breakdown-grid > article {
  padding: 1.15rem;
}
.service-statistics__bar-list {
  display: grid;
  gap: 0.8rem;
}
.service-statistics__bar-list > div > div,
.service-statistics__compact-breakdowns p {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}
.service-statistics__bar-track {
  display: block;
  height: 0.55rem;
  margin-top: 0.3rem;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-ground);
}
.service-statistics__bar-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--p-primary-color);
}
.service-statistics__compact-breakdowns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.25rem;
}
.service-statistics__compact-breakdowns h3 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}
.service-statistics__compact-breakdowns p {
  margin: 0.45rem 0;
}
.service-statistics__table-scroll {
  overflow-x: auto;
}
.service-statistics table {
  width: 100%;
  border-collapse: collapse;
}
.service-statistics th,
.service-statistics td {
  padding: 0.75rem;
  text-align: right;
  border-bottom: 1px solid var(--surface-border);
  white-space: nowrap;
}
.service-statistics th:first-child {
  text-align: left;
}
.service-statistics tbody th {
  font-weight: 600;
}
.service-statistics__note,
.service-statistics__privacy {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
}
.service-statistics__note p,
.service-statistics__privacy p {
  margin: 0;
}
.service-statistics__privacy i,
.service-statistics__note i {
  margin-top: 0.15rem;
  color: var(--p-primary-color);
}
.service-statistics__privacy strong + p {
  margin-top: 0.25rem;
  color: var(--text-color-secondary);
}
@media (max-width: 900px) {
  .service-statistics__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .service-statistics__filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .service-statistics__hero,
  .service-statistics__section-heading {
    align-items: stretch;
    flex-direction: column;
  }
  .service-statistics__hero :deep(.p-button) {
    width: 100%;
  }
  .service-statistics__filter-grid,
  .service-statistics__kpis,
  .service-statistics__breakdown-grid,
  .service-statistics__service-levels {
    grid-template-columns: 1fr;
  }
  .service-statistics__compact-breakdowns {
    grid-template-columns: 1fr 1fr;
  }
  .service-statistics__filter-actions :deep(.p-button) {
    flex: 1 1 auto;
  }
}
</style>
