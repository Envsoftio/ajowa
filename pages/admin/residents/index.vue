<script setup lang="ts">
import type { DataTablePageEvent, DataTableSortEvent } from 'primevue/datatable'
import type { ListQueryParams } from '~/types/api'
import type {
  FlatSummary,
  ProfessionSummary,
  ResidentSummary,
} from '~/types/domain'
import ResidentEditorDialog from '~/components/residents/ResidentEditorDialog.vue'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Residents',
})

const api = useApi()
const toast = useToast()
const confirmAction = useAppConfirm()

const query = ref<ListQueryParams>({
  page: 1,
  pageSize: 10,
  search: '',
  sortBy: 'fullName',
  sortDirection: 'asc',
  filters: {},
})

const selectedResidentId = ref<string | null>(null)
const displayDialog = ref(false)
const sendingBulkInvites = ref(false)

type BulkInvitePreviewResponse = {
  totalMatching: number
  expectedInvites: number
  skippedMissingLoginIdentity: number
  skippedInvalidLoginIdentity: number
  skippedDuplicateLoginIdentity: number
  syncableExistingLoginFlats: number
}

type BulkInviteResponse = {
  totalMatching: number
  created: number
  skippedMissingLoginIdentity: number
  skippedInvalidLoginIdentity?: number
  skippedDuplicateLoginIdentity?: number
  syncedExistingLoginFlats?: number
  emailDelivery: {
    delivered: number
    failed: number
    failures: Array<{ email: string; reason: string }>
  }
}

const loadResidents = () =>
  api<{ ok: true; data: { items: ResidentSummary[]; total: number } }>(
    '/api/admin/residents',
    {
      query: {
        page: query.value.page,
        pageSize: query.value.pageSize,
        search: query.value.search,
        sortBy: query.value.sortBy,
        sortDirection: query.value.sortDirection,
        canLogin: query.value.filters.canLogin?.[0],
        isActive: query.value.filters.isActive?.[0],
        flatId: query.value.filters.flatId?.[0],
        professionId: query.value.filters.professionId?.[0],
      },
    },
  )

const [flatsAsyncData, professionsAsyncData, residentsAsyncData] =
  await Promise.all([
    useAsyncData('admin-flat-options', () =>
      api<{ ok: true; data: { items: FlatSummary[] } }>('/api/admin/flats', {
        query: {
          page: 1,
          pageSize: 500,
          sortBy: 'flatNumber',
          sortDirection: 'asc',
        },
      }),
    ),
    useAsyncData('admin-profession-options', () =>
      api<{ ok: true; data: { items: ProfessionSummary[] } }>(
        '/api/admin/professions',
        {
          query: {
            page: 1,
            pageSize: 500,
            sortBy: 'sortOrder',
            sortDirection: 'asc',
            isActive: 'true',
          },
        },
      ),
    ),
    useAsyncData('admin-residents', loadResidents, {
      watch: [query],
    }),
  ])

const { data: flatsData } = flatsAsyncData
const { data: professionsData } = professionsAsyncData
const { data, pending, refresh } = residentsAsyncData

const flatOptions = computed(() =>
  (flatsData.value?.data.items ?? []).map((item) => ({
    label: `${item.blockName} · ${item.flatNumber}`,
    value: item.id,
  })),
)

const professionOptions = computed(() =>
  (professionsData.value?.data.items ?? []).map((item) => ({
    label: item.name,
    value: item.id,
  })),
)

const openCreateDialog = () => {
  selectedResidentId.value = null
  displayDialog.value = true
}

const openEditDialog = (resident: ResidentSummary) => {
  selectedResidentId.value = resident.id
  displayDialog.value = true
}

watch(displayDialog, (visible) => {
  if (!visible) {
    selectedResidentId.value = null
  }
})

const onResidentSaved = async () => {
  await refresh()
}

const buildBulkInvitePayload = () => ({
  search: query.value.search ?? '',
  flatId: flatFilter.value || undefined,
  isActive: activeFilter.value || 'true',
  canLogin: 'false',
})

const formatBulkInvitePreview = (preview: BulkInvitePreviewResponse) => {
  const parts = [
    `${preview.totalMatching} matching resident${preview.totalMatching === 1 ? '' : 's'}`,
    `${preview.expectedInvites} invite${preview.expectedInvites === 1 ? '' : 's'} expected`,
  ]

  if (preview.syncableExistingLoginFlats > 0) {
    parts.push(
      `${preview.syncableExistingLoginFlats} existing-login flat${preview.syncableExistingLoginFlats === 1 ? '' : 's'} can be synced`,
    )
  }

  if (preview.skippedMissingLoginIdentity > 0) {
    parts.push(`${preview.skippedMissingLoginIdentity} without login identity`)
  }

  if (preview.skippedInvalidLoginIdentity > 0) {
    parts.push(`${preview.skippedInvalidLoginIdentity} invalid email`)
  }

  if (preview.skippedDuplicateLoginIdentity > 0) {
    parts.push(`${preview.skippedDuplicateLoginIdentity} duplicate email`)
  }

  return parts.join(' · ')
}

const sendBulkInvites = async () => {
  sendingBulkInvites.value = true

  let preview: BulkInvitePreviewResponse

  try {
    const previewResponse = await api<{
      ok: true
      data: BulkInvitePreviewResponse
    }>('/api/admin/residents/bulk-invites/preview', {
      query: buildBulkInvitePayload(),
    })

    preview = previewResponse.data
  } finally {
    sendingBulkInvites.value = false
  }

  const confirmed = await confirmAction({
    header: 'Invite residents',
    message: `${formatBulkInvitePreview(preview)}. Create and send invite links to eligible login-disabled residents matching the current filters? Existing pending invites for those emails will be replaced.`,
    icon: 'pi pi-send',
    acceptLabel: 'Send invites',
    acceptSeverity: 'info',
  })

  if (!confirmed) {
    return
  }

  sendingBulkInvites.value = true

  try {
    const response = await api<{ ok: true; data: BulkInviteResponse }>(
      '/api/admin/residents/bulk-invites',
      {
        method: 'POST',
        body: buildBulkInvitePayload(),
      },
    )

    const result = response.data
    const failed = result.emailDelivery.failed
    const skipped = result.skippedMissingLoginIdentity
    const skippedInvalid = result.skippedInvalidLoginIdentity ?? 0
    const skippedDuplicates = result.skippedDuplicateLoginIdentity ?? 0
    const syncedExistingFlats = result.syncedExistingLoginFlats ?? 0
    const detailParts = [
      `${result.created} invite${result.created === 1 ? '' : 's'} created`,
      `${result.emailDelivery.delivered} delivered`,
    ]

    if (failed > 0) {
      detailParts.push(`${failed} failed`)
    }

    if (skipped > 0) {
      detailParts.push(`${skipped} skipped without login identity`)
    }

    if (skippedInvalid > 0) {
      detailParts.push(`${skippedInvalid} skipped invalid email`)
    }

    if (skippedDuplicates > 0) {
      detailParts.push(`${skippedDuplicates} skipped duplicate email`)
    }

    if (syncedExistingFlats > 0) {
      detailParts.push(`${syncedExistingFlats} existing-login flats synced`)
    }

    toast.add({
      severity:
        failed > 0 || skipped > 0 || skippedInvalid > 0 || skippedDuplicates > 0
          ? 'warn'
          : 'success',
      summary: 'Bulk invites processed',
      detail: detailParts.join(' · '),
      life: 12000,
    })

    await refresh()
  } finally {
    sendingBulkInvites.value = false
  }
}

const updateQuery = (value: ListQueryParams) => {
  query.value = value
}

const first = computed(() => (query.value.page - 1) * query.value.pageSize)

const onPage = (event: DataTablePageEvent) => {
  updateQuery({
    ...query.value,
    page: Math.floor(event.first / event.rows) + 1,
    pageSize: event.rows,
  })
}

const onSort = (event: DataTableSortEvent) => {
  updateQuery({
    ...query.value,
    sortBy: typeof event.sortField === 'string' ? event.sortField : '',
    sortDirection: event.sortOrder === -1 ? 'desc' : 'asc',
  })
}

const globalSearch = ref(query.value.search ?? '')
const onSearch = () => {
  updateQuery({
    ...query.value,
    page: 1,
    search: globalSearch.value.trim(),
  })
}

const activeFilter = computed({
  get: () => query.value.filters.isActive?.[0] ?? '',
  set: (val) => {
    updateQuery({
      ...query.value,
      page: 1,
      filters: {
        ...query.value.filters,
        isActive: val ? [val] : [],
      },
    })
  },
})

const loginFilter = computed({
  get: () => query.value.filters.canLogin?.[0] ?? '',
  set: (val) => {
    updateQuery({
      ...query.value,
      page: 1,
      filters: {
        ...query.value.filters,
        canLogin: val ? [val] : [],
      },
    })
  },
})

const flatFilter = computed({
  get: () => query.value.filters.flatId?.[0] ?? '',
  set: (val) => {
    updateQuery({
      ...query.value,
      page: 1,
      filters: {
        ...query.value.filters,
        flatId: val ? [val] : [],
      },
    })
  },
})

const professionFilter = computed({
  get: () => query.value.filters.professionId?.[0] ?? '',
  set: (val) => {
    updateQuery({
      ...query.value,
      page: 1,
      filters: {
        ...query.value.filters,
        professionId: val ? [val] : [],
      },
    })
  },
})

const displayValue = (value: string | null | undefined) => value || '-'
const relationshipSeverity = (type: string) => {
  if (type === 'OWNER') return 'success'
  if (type === 'TENANT') return 'info'
  return 'secondary'
}
</script>

<template>
  <div class="landing-page">
    <div>
      <section class="list-page surface-card">
        <header class="list-page__header">
          <div>
            <h1>Resident registry</h1>
            <p>
              Resident CRUD with server-driven search and account-state
              visibility.
            </p>
          </div>
          <div class="list-page__exports">
            <Button
              label="Invite pending logins"
              icon="pi pi-send"
              severity="secondary"
              outlined
              :loading="sendingBulkInvites"
              @click="sendBulkInvites"
            />
            <Button
              label="Create resident"
              icon="pi pi-plus"
              @click="openCreateDialog"
            />
          </div>
        </header>

        <div class="list-page__toolbar">
          <IconField class="list-page__search">
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="globalSearch"
              placeholder="Search residents by name, email, or mobile"
              @keydown.enter="onSearch"
            />
          </IconField>
          <div class="list-page__filters">
            <Select
              v-model="flatFilter"
              :options="[{ label: 'All flats', value: '' }, ...flatOptions]"
              option-label="label"
              option-value="value"
              placeholder="Flat"
              filter
              show-clear
            />
            <Select
              v-model="professionFilter"
              :options="[
                { label: 'All professions', value: '' },
                ...professionOptions,
              ]"
              option-label="label"
              option-value="value"
              placeholder="Profession"
              filter
              show-clear
            />
            <Select
              v-model="loginFilter"
              :options="[
                { label: 'All logins', value: '' },
                { label: 'Login enabled', value: 'true' },
                { label: 'Login disabled', value: 'false' },
              ]"
              option-label="label"
              option-value="value"
              placeholder="Login state"
            />
            <Select
              v-model="activeFilter"
              :options="[
                { label: 'All status', value: '' },
                { label: 'Active only', value: 'true' },
                { label: 'Inactive only', value: 'false' },
              ]"
              option-label="label"
              option-value="value"
              placeholder="Active state"
            />
            <Button label="Search" @click="onSearch" />
          </div>
        </div>

        <AppDataTable
          :value="data?.data.items ?? []"
          :loading="pending"
          :lazy="true"
          paginator
          responsive-layout="scroll"
          class="list-page__table"
          :rows="query.pageSize"
          :first="first"
          :total-records="data?.data.total ?? 0"
          :sort-field="query.sortBy"
          :sort-order="query.sortDirection === 'desc' ? -1 : 1"
          @page="onPage"
          @sort="onSort"
        >
          <Column field="fullName" header="Resident" sortable />
          <Column header="Type">
            <template #body="{ data: row }">
              <div class="resident-table-tags">
                <Tag
                  v-for="type in row.relationshipTypes"
                  :key="type"
                  :severity="relationshipSeverity(type)"
                  :value="type.replaceAll('_', ' ')"
                  rounded
                />
                <span v-if="!row.relationshipTypes?.length">-</span>
              </div>
            </template>
          </Column>
          <Column header="Flat">
            <template #body="{ data: row }">
              <div class="resident-table-flats">
                <span v-for="flatNumber in row.flatNumbers" :key="flatNumber">{{
                  flatNumber
                }}</span>
                <span v-if="!row.flatNumbers?.length">-</span>
              </div>
            </template>
          </Column>
          <Column header="Profession">
            <template #body="{ data: row }">
              <div
                v-if="row.professionProfile?.isActive"
                class="resident-table-tags"
              >
                <Tag
                  :value="row.professionProfile.professionName"
                  :severity="
                    row.professionProfile.isPublic ? 'success' : 'secondary'
                  "
                  rounded
                />
              </div>
              <span v-else>-</span>
            </template>
          </Column>
          <Column field="email" header="Email" sortable>
            <template #body="{ data: row }">
              {{ displayValue(row.email ?? row.sourceEmail) }}
            </template>
          </Column>
          <Column field="mobileNumber" header="Mobile">
            <template #body="{ data: row }">
              {{ displayValue(row.mobileNumber ?? row.sourceContact) }}
            </template>
          </Column>
          <Column field="canLogin" header="Login" sortable>
            <template #body="{ data: row }">
              <AppStatusBadge :status="row.canLogin ? 'active' : 'inactive'" />
            </template>
          </Column>
          <Column field="isActive" header="Active" sortable>
            <template #body="{ data: row }">
              <AppStatusBadge :status="row.isActive ? 'active' : 'inactive'" />
            </template>
          </Column>
          <Column header="Actions" class="text-right" style="width: 150px">
            <template #body="{ data: row }">
              <div
                class="admin-inline-actions"
                style="justify-content: flex-end; gap: 0.5rem"
              >
                <NuxtLink :to="`/admin/residents/${row.id}`">
                  <Button
                    icon="pi pi-eye"
                    severity="secondary"
                    text
                    rounded
                    aria-label="View detail"
                  />
                </NuxtLink>
                <Button
                  icon="pi pi-pencil"
                  severity="secondary"
                  text
                  rounded
                  aria-label="Edit resident"
                  @click="openEditDialog(row)"
                />
              </div>
            </template>
          </Column>
        </AppDataTable>
      </section>
    </div>

    <ResidentEditorDialog
      v-model:visible="displayDialog"
      :resident-id="selectedResidentId"
      @saved="onResidentSaved"
    />
  </div>
</template>

<style scoped>
.resident-table-tags,
.resident-table-flats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}

.resident-table-flats span {
  font-weight: 700;
  color: var(--color-text);
}
</style>
