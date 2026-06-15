<script setup lang="ts">
import type { BlockSummary, FlatSummary } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Flats',
})

const api = useApi()
const toast = useToast()

const selectedFlat = ref<FlatSummary | null>(null)
const displayDialog = ref(false)

const globalSearch = ref('')
const blockFilter = ref('')
const occupancyFilter = ref('')
const activeFilter = ref('')

const form = reactive({
  blockId: '',
  flatNumber: '',
  floorLabel: '',
  unitType: '',
  areaSqFt: null as number | null,
  occupancyStatus: 'VACANT',
  isActive: true,
})

const { data: blocksData } = await useAsyncData('admin-block-options', () =>
  api<{ ok: true; data: { items: BlockSummary[] } }>('/api/admin/blocks', {
    query: { page: 1, pageSize: 100, sortBy: 'sortOrder', sortDirection: 'asc' },
  }),
)

const blockOptions = computed(() =>
  (blocksData.value?.data.items ?? []).map((item) => ({
    label: `${item.code} · ${item.name}`,
    value: item.id,
  })),
)

const loadFlats = () =>
  api<{ ok: true; data: { items: FlatSummary[]; total: number } }>('/api/admin/flats', {
    query: {
      page: 1,
      pageSize: 2000,
      sortBy: 'flatNumber',
      sortDirection: 'asc',
    },
  })

const { data, pending, refresh } = await useAsyncData('admin-flats', loadFlats)

const flats = computed(() => data.value?.data.items ?? [])

const filteredFlats = computed(() => {
  let list = flats.value

  if (globalSearch.value.trim()) {
    const search = globalSearch.value.toLowerCase().trim()
    list = list.filter(
      (f) =>
        f.flatNumber.toLowerCase().includes(search) ||
        f.blockName.toLowerCase().includes(search) ||
        f.unitType.toLowerCase().includes(search),
    )
  }

  if (blockFilter.value !== '') {
    list = list.filter((f) => f.blockId === blockFilter.value)
  }

  if (occupancyFilter.value !== '') {
    list = list.filter((f) => f.occupancyStatus === occupancyFilter.value)
  }

  if (activeFilter.value !== '') {
    const isActive = activeFilter.value === 'true'
    list = list.filter((f) => f.isActive === isActive)
  }

  return list
})

const resetForm = () => {
  selectedFlat.value = null
  form.blockId = ''
  form.flatNumber = ''
  form.floorLabel = ''
  form.unitType = ''
  form.areaSqFt = null
  form.occupancyStatus = 'VACANT'
  form.isActive = true
}

const openCreateDialog = () => {
  resetForm()
  displayDialog.value = true
}

const editFlat = (flat: FlatSummary) => {
  selectedFlat.value = flat
  form.blockId = flat.blockId
  form.flatNumber = flat.flatNumber
  form.floorLabel = flat.floorLabel ?? ''
  form.unitType = flat.unitType
  form.areaSqFt = flat.areaSqFt
  form.occupancyStatus = flat.occupancyStatus
  form.isActive = flat.isActive
  displayDialog.value = true
}

const closeDialog = () => {
  displayDialog.value = false
  resetForm()
}

const saving = ref(false)

const submit = async () => {
  saving.value = true

  try {
    const payload = {
      ...form,
      floorLabel: form.floorLabel || null,
    }

    if (selectedFlat.value) {
      await api(`/api/admin/flats/${selectedFlat.value.id}`, {
        method: 'PATCH',
        body: payload,
      })
    } else {
      await api('/api/admin/flats', {
        method: 'POST',
        body: payload,
      })
    }

    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: selectedFlat.value ? 'Flat updated.' : 'Flat created.',
      life: 3000,
    })
    closeDialog()
    await refresh()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="landing-page">
   

    <div>
      <section class="list-page surface-card">
        <header class="list-page__header">
          <div>
            <h1>Flat registry</h1>
            <p>Manage flat inventory, unit types, occupancy states, and active flags.</p>
          </div>
          <div class="list-page__exports">
            <Button label="Create flat" icon="pi pi-plus" @click="openCreateDialog" />
          </div>
        </header>

        <div class="list-page__toolbar">
          <IconField class="list-page__search">
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="globalSearch"
              placeholder="Search by flat, block, or unit type"
            />
          </IconField>
          <div class="list-page__filters">
            <Select
              v-model="blockFilter"
              :options="[{ label: 'All blocks', value: '' }, ...blockOptions]"
              option-label="label"
              option-value="value"
              placeholder="Select Block"
            />
            <Select
              v-model="occupancyFilter"
              :options="[
                { label: 'All occupancy', value: '' },
                { label: 'Self Occupied', value: 'SELF_OCCUPIED' },
                { label: 'Tenanted', value: 'TENANTED' },
                { label: 'Vacant', value: 'VACANT' }
              ]"
              option-label="label"
              option-value="value"
              placeholder="Occupancy"
            />
            <Select
              v-model="activeFilter"
              :options="[
                { label: 'All status', value: '' },
                { label: 'Active only', value: 'true' },
                { label: 'Inactive only', value: 'false' }
              ]"
              option-label="label"
              option-value="value"
              placeholder="Active state"
            />
          </div>
        </div>

        <DataTable
          :value="filteredFlats"
          :loading="pending"
          paginator
          :rows="20"
          :rows-per-page-options="[10, 20, 50, 100]"
          responsive-layout="scroll"
          class="list-page__table"
          removable-sort
        >
          <Column field="flatNumber" header="Flat" sortable />
          <Column field="blockName" header="Block" sortable />
          <Column field="floorLabel" header="Floor" sortable>
            <template #body="{ data: row }">
              <span>{{ row.floorLabel || '—' }}</span>
            </template>
          </Column>
          <Column field="unitType" header="Unit type" sortable />
          <Column field="areaSqFt" header="Area (sq ft)" sortable>
            <template #body="{ data: row }">
              <span>{{ row.areaSqFt ? `${row.areaSqFt} sq ft` : '—' }}</span>
            </template>
          </Column>
          <Column field="occupancyStatus" header="Occupancy" sortable>
            <template #body="{ data: row }">
              <AppStatusBadge :status="row.occupancyStatus" />
            </template>
          </Column>
          <Column field="ownerCount" header="Owners" sortable>
            <template #body="{ data: row }">
              <span>{{ row.ownerCount ?? 0 }}</span>
            </template>
          </Column>
          <Column field="tenantCount" header="Tenants" sortable>
            <template #body="{ data: row }">
              <span>{{ row.tenantCount ?? 0 }}</span>
            </template>
          </Column>
          <Column field="isActive" header="Active" sortable>
            <template #body="{ data: row }">
              <AppStatusBadge :status="row.isActive ? 'active' : 'inactive'" />
            </template>
          </Column>
          <Column header="Actions" class="text-right" style="width: 150px">
            <template #body="{ data: row }">
              <div class="admin-inline-actions" style="justify-content: flex-end; gap: 0.5rem;">
                <NuxtLink :to="`/admin/flats/${row.id}`">
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
                  aria-label="Edit flat"
                  @click="editFlat(row)"
                />
              </div>
            </template>
          </Column>
        </DataTable>
      </section>
    </div>

    <Dialog
      v-model:visible="displayDialog"
      :header="selectedFlat ? 'Edit Flat' : 'Create Flat'"
      modal
      class="p-dialog-custom"
      :style="{ width: '500px' }"
      :pt="{
        root: { style: { borderRadius: 'var(--radius-lg)', overflow: 'hidden' } }
      }"
    >
      <form class="admin-form-layout" style="padding: 1.5rem 0 0;" @submit.prevent="submit">
        <div class="admin-form-grid">
          <label>
            <span>Block</span>
            <Select v-model="form.blockId" :options="blockOptions" option-label="label" option-value="value" required />
          </label>
          <label>
            <span>Flat number</span>
            <InputText v-model="form.flatNumber" required />
          </label>
          <label>
            <span>Floor</span>
            <InputText v-model="form.floorLabel" />
          </label>
          <label>
            <span>Unit type</span>
            <InputText v-model="form.unitType" required />
          </label>
          <label>
            <span>Area (sq ft)</span>
            <InputNumber v-model="form.areaSqFt" :min="0" fluid />
          </label>
          <label>
            <span>Occupancy</span>
            <Select v-model="form.occupancyStatus" :options="['SELF_OCCUPIED', 'TENANTED', 'VACANT']" required />
          </label>
          <label class="admin-toggle-card admin-form-grid__full">
            <span>Active flat</span>
            <ToggleSwitch v-model="form.isActive" />
          </label>
        </div>

        <div class="admin-inline-actions" style="justify-content: flex-end; margin-top: 2rem; gap: 0.75rem;">
          <Button type="button" label="Cancel" severity="secondary" outlined @click="closeDialog" />
          <Button type="submit" :label="selectedFlat ? 'Update flat' : 'Create flat'" :loading="saving" />
        </div>
      </form>
    </Dialog>
  </div>
</template>
