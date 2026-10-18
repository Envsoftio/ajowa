<script setup lang="ts">
import PrimeDataTable from 'primevue/datatable'
import { Fragment, type VNode } from 'vue'
import { downloadTableExcel, fetchAllTableRows, type TableExportColumn } from '~/composables/useTableExcelExport'

const props = withDefaults(defineProps<{
  exportSource?: string | undefined
  exportQuery?: Record<string, unknown> | undefined
  exportName?: string
  exportable?: boolean
  exportColumns?: TableExportColumn[]
}>(), {
  exportable: true,
  exportSource: '',
  exportQuery: () => ({}),
  exportName: '',
  exportColumns: () => [],
})

defineOptions({
  inheritAttrs: false,
})

const attrs = useAttrs()
const slots = useSlots()

const slotNames = computed(() => Object.keys(slots))

const rows = computed(() => {
  const value = attrs.value
  return Array.isArray(value) ? value : []
})

const totalRecords = computed(() => {
  const total = attrs.totalRecords ?? attrs['total-records']
  const numericTotal = Number(total)

  return Number.isFinite(numericTotal) ? numericTotal : rows.value.length
})

const countLabel = computed(() =>
  new Intl.NumberFormat('en-IN').format(totalRecords.value),
)

const shownLabel = computed(() =>
  new Intl.NumberFormat('en-IN').format(rows.value.length),
)

const shouldShowVisibleCount = computed(
  () => rows.value.length !== totalRecords.value,
)

const exporting = ref(false)
const toast = useToast()
const api = useApi()
const route = useRoute()

const tableColumns = (): TableExportColumn[] => {
  if (props.exportColumns?.length) return props.exportColumns
  const columns: TableExportColumn[] = []
  const visit = (nodes: VNode[]) => {
    for (const node of nodes) {
      if (node.type === Fragment && Array.isArray(node.children)) {
        visit(node.children as VNode[])
        continue
      }
      const field = node.props?.field
      const header = node.props?.header
      if (typeof field === 'string' && field && typeof header === 'string' && header) {
        columns.push({ field, header })
      }
    }
  }
  visit(slots.default?.() ?? [])
  return columns
}

const exportExcel = async () => {
  if (exporting.value) return
  exporting.value = true
  try {
    const exportRows = props.exportSource
      ? await fetchAllTableRows<Record<string, unknown>>(
          (query) => api<{ data: { items: Record<string, unknown>[]; total: number } }>(props.exportSource, { query, showErrorToast: false }),
          props.exportQuery,
        )
      : rows.value as Record<string, unknown>[]
    const columns = tableColumns()
    if (!columns.length && exportRows.length) {
      for (const field of Object.keys(exportRows[0] ?? {})) {
        if (!/^(id|.*Id|.*_id)$/.test(field)) columns.push({ field, header: field.replace(/([a-z])([A-Z])/g, '$1 $2') })
      }
    }
    await downloadTableExcel(exportRows, columns, props.exportName || route.path.replace(/^\/+/, '').replace(/\//g, '-') || 'table-data')
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Excel export failed',
      detail: error instanceof Error ? error.message : 'Could not download the table.',
      life: 6000,
    })
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="app-data-table">
    <div class="app-data-table__count" aria-live="polite">
      <span>Total records</span>
      <strong>{{ countLabel }}</strong>
      <span v-if="shouldShowVisibleCount">Showing {{ shownLabel }}</span>
      <Button
        v-if="exportable"
        label="Excel"
        icon="pi pi-file-excel"
        severity="secondary"
        outlined
        size="small"
        :loading="exporting"
        :disabled="totalRecords === 0"
        aria-label="Export table to Excel"
        @click="exportExcel"
      />
    </div>

    <PrimeDataTable v-bind="attrs">
      <template v-for="name in slotNames" #[name]="slotProps">
        <slot :name="name" v-bind="slotProps ?? {}" />
      </template>
    </PrimeDataTable>
  </div>
</template>
