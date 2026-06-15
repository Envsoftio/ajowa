<script setup lang="ts">
import type { ListQueryParams } from '~/types/api'

definePageMeta({
  layout: 'admin',
  title: 'Phase 1 Setup',
})

const query = ref<ListQueryParams>({
  page: 1,
  pageSize: 5,
  search: '',
  sortBy: 'name',
  sortDirection: 'asc',
  filters: {},
})

const rows = computed(() => {
  const source = [
    { name: 'Resident import', owner: 'Ops Team', status: 'active', area: 'Delivery' },
    { name: 'Finance rules', owner: 'Manager', status: 'pending', area: 'Finance' },
    { name: 'Guard QR flow', owner: 'Security Desk', status: 'blocked', area: 'Access' },
    { name: 'Theme tokens', owner: 'Frontend', status: 'paid', area: 'UI' },
    { name: 'Audit helpers', owner: 'Platform', status: 'open', area: 'API' },
  ]

  const search = query.value.search?.toLowerCase()
  const filtered = search
    ? source.filter((item) =>
        [item.name, item.owner, item.status, item.area].some((value) =>
          value.toLowerCase().includes(search),
        ),
      )
    : source

  return filtered
})

const columns = [
  { field: 'name', header: 'Task', sortable: true },
  { field: 'owner', header: 'Owner', sortable: true },
  { field: 'status', header: 'Status', sortable: true, kind: 'status' as const },
  { field: 'area', header: 'Area', sortable: true },
]

const updateQuery = (value: ListQueryParams) => {
  query.value = value
}
</script>

<template>
  <div class="landing-page">
    <!-- <section class="hero-panel">
      <Tag severity="contrast" value="Setup" rounded />
      <h1>Local Setup</h1>
      <p>
        Copy `.env.example` to `.env`, install dependencies with `npm install`, and
        start the SSR app with `npm run dev`.
      </p>
      <p>
        Phase 2 will add the full local Supabase bootstrap, but the standard workflow is
        already documented in the repository README and `docs/project-setup.md`.
      </p>
    </section> -->

    <AppListPage
      title="Foundation Completion Tracker"
      description="A reusable Phase 1 list-page pattern with search, status badges, pagination hooks, and mobile cards."
      :rows="rows"
      :columns="columns"
      :query="query"
      :total-records="rows.length"
      search-placeholder="Search setup tasks"
      :export-actions="[{ label: 'Export XLSX', key: 'xlsx' }, { label: 'Export PDF', key: 'pdf' }]"
      @query="updateQuery"
    >
      <template #summary>
        <div class="list-page-summary">
          <AppStatusBadge status="active" />
          <AppStatusBadge status="pending" />
          <AppStatusBadge status="blocked" />
        </div>
      </template>
    </AppListPage>
  </div>
</template>
