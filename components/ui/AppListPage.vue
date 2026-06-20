<script setup lang="ts" generic="TRow extends Record<string, unknown>">
import type { DataTablePageEvent, DataTableSortEvent } from 'primevue/datatable'
import type { ListQueryParams } from '~/types/api'

type ExportAction = {
  label: string
  key: string
}

type ColumnDef = {
  field: string
  header: string
  sortable?: boolean
  kind?: 'text' | 'status'
}

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    rows: TRow[]
    columns: ColumnDef[]
    query: ListQueryParams
    totalRecords: number
    loading?: boolean
    searchPlaceholder?: string
    exportActions?: ExportAction[]
    emptyTitle?: string
    emptyMessage?: string
  }>(),
  {
    description: '',
    loading: false,
    searchPlaceholder: 'Search records',
    exportActions: () => [],
    emptyTitle: 'No records yet',
    emptyMessage: 'Adjust the filters or add the first record to get started.',
  },
)

const emit = defineEmits<{
  query: [value: ListQueryParams]
  export: [key: string]
}>()

const searchTerm = ref(props.query.search ?? '')

watch(
  () => props.query.search,
  (value) => {
    searchTerm.value = value ?? ''
  },
)

const first = computed(() => (props.query.page - 1) * props.query.pageSize)

const updateQuery = (patch: Partial<ListQueryParams>) => {
  const nextQuery: ListQueryParams = {
    ...props.query,
    filters: props.query.filters,
  }

  if (patch.page !== undefined) {
    nextQuery.page = patch.page
  }

  if (patch.pageSize !== undefined) {
    nextQuery.pageSize = patch.pageSize
  }

  if (patch.filters !== undefined) {
    nextQuery.filters = patch.filters
  }

  if ('search' in patch) {
    if (patch.search) {
      nextQuery.search = patch.search
    } else {
      delete nextQuery.search
    }
  }

  if ('sortBy' in patch) {
    if (patch.sortBy) {
      nextQuery.sortBy = patch.sortBy
    } else {
      delete nextQuery.sortBy
    }
  }

  if ('sortDirection' in patch) {
    if (patch.sortDirection) {
      nextQuery.sortDirection = patch.sortDirection
    } else {
      delete nextQuery.sortDirection
    }
  }

  emit('query', nextQuery)
}

const onSearch = () => {
  const nextSearch = searchTerm.value.trim()

  updateQuery(
    nextSearch
      ? {
          page: 1,
          search: nextSearch,
        }
      : {
          page: 1,
          search: '',
        },
  )
}

const onPage = (event: DataTablePageEvent) => {
  updateQuery({
    page: Math.floor(event.first / event.rows) + 1,
    pageSize: event.rows,
  })
}

const onSort = (event: DataTableSortEvent) => {
  updateQuery({
    sortBy: typeof event.sortField === 'string' ? event.sortField : '',
    sortDirection: event.sortOrder === -1 ? 'desc' : 'asc',
  })
}

const resolveCellValue = (row: TRow, field: string) => {
  const value = row[field]
  return value == null || value === '' ? '—' : String(value)
}
</script>

<template>
  <section class="list-page surface-card">
    <header class="list-page__header">
      <div>
        <p class="eyebrow">Server-Driven List Pattern</p>
        <h1>{{ title }}</h1>
        <p v-if="description">{{ description }}</p>
      </div>
      <div v-if="exportActions.length || $slots.actions" class="list-page__exports">
        <slot name="actions" />
        <Button
          v-for="action in exportActions"
          :key="action.key"
          :label="action.label"
          severity="secondary"
          outlined
          @click="emit('export', action.key)"
        />
      </div>
    </header>

    <div class="list-page__toolbar">
      <IconField class="list-page__search">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="searchTerm"
          :placeholder="searchPlaceholder"
          :disabled="loading"
          aria-label="Search records"
          @keydown.enter="onSearch"
        />
      </IconField>
      <div class="list-page__filters">
        <slot name="filters" />
        <Button :label="loading ? 'Searching…' : 'Search'" :disabled="loading" @click="onSearch" />
      </div>
    </div>

    <slot name="summary" />

    <AppState
      v-if="!loading && rows.length === 0"
      variant="empty"
      :title="emptyTitle"
      :message="emptyMessage"
    />

    <template v-else>
      <AppDataTable
        :value="rows"
        :loading="loading"
        :lazy="true"
        paginator
        responsive-layout="scroll"
        class="list-page__table"
        :rows="query.pageSize"
        :first="first"
        :total-records="totalRecords"
        :sort-field="query.sortBy"
        :sort-order="query.sortDirection === 'desc' ? -1 : 1"
        @page="onPage"
        @sort="onSort"
      >
        <Column
          v-for="column in columns"
          :key="column.field"
          :field="column.field"
          :header="column.header"
          :sortable="column.sortable"
        >
          <template #body="{ data }">
            <slot :name="`cell-${column.field}`" :row="data" :value="data[column.field]">
              <AppStatusBadge
                v-if="column.kind === 'status' && typeof data[column.field] === 'string'"
                :status="String(data[column.field])"
              />
              <span v-else>{{ resolveCellValue(data, column.field) }}</span>
            </slot>
          </template>
        </Column>
      </AppDataTable>

      <div class="list-page__cards">
        <article v-for="(row, index) in rows" :key="index" class="list-card">
          <div v-for="column in columns" :key="column.field" class="list-card__row">
            <span>{{ column.header }}</span>
            <slot :name="`cell-${column.field}`" :row="row" :value="row[column.field]">
              <AppStatusBadge
                v-if="column.kind === 'status' && typeof row[column.field] === 'string'"
                :status="String(row[column.field])"
              />
              <strong v-else>{{ resolveCellValue(row, column.field) }}</strong>
            </slot>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>
