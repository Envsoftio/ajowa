<script setup lang="ts">
import type { BlockSummary } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Blocks',
})

const api = useApi()
const toast = useToast()

const selectedBlock = ref<BlockSummary | null>(null)
const displayDialog = ref(false)
const selectedBlockFlatCount = ref(0)

const globalSearch = ref('')
const activeFilter = ref('')

const form = reactive({
  code: '',
  name: '',
  description: '',
  sortOrder: 0,
  isActive: true,
})

const loadBlocks = () =>
  api<{ ok: true; data: { items: BlockSummary[]; total: number } }>('/api/admin/blocks', {
    query: {
      page: 1,
      pageSize: 100,
      sortBy: 'sortOrder',
      sortDirection: 'asc',
    },
  })

const { data, pending, refresh } = await useAsyncData('admin-blocks', loadBlocks)

const blocks = computed(() => data.value?.data.items ?? [])

const filteredBlocks = computed(() => {
  let list = blocks.value

  if (globalSearch.value.trim()) {
    const search = globalSearch.value.toLowerCase().trim()
    list = list.filter(
      (b) =>
        b.code.toLowerCase().includes(search) ||
        b.name.toLowerCase().includes(search) ||
        (b.description && b.description.toLowerCase().includes(search)),
    )
  }

  if (activeFilter.value !== '') {
    const isActive = activeFilter.value === 'true'
    list = list.filter((b) => b.isActive === isActive)
  }

  return list
})

const resetForm = () => {
  selectedBlock.value = null
  form.code = ''
  form.name = ''
  form.description = ''
  form.sortOrder = 0
  form.isActive = true
  selectedBlockFlatCount.value = 0
}

const openCreateDialog = () => {
  resetForm()
  displayDialog.value = true
}

const editBlock = (block: BlockSummary) => {
  selectedBlock.value = block
  form.code = block.code
  form.name = block.name
  form.description = block.description ?? ''
  form.sortOrder = block.sortOrder
  form.isActive = block.isActive
  selectedBlockFlatCount.value = block.flatCount ?? 0
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
      description: form.description || null,
    }

    if (selectedBlock.value) {
      await api(`/api/admin/blocks/${selectedBlock.value.id}`, {
        method: 'PATCH',
        body: payload,
      })
    } else {
      await api('/api/admin/blocks', {
        method: 'POST',
        body: payload,
      })
    }

    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: selectedBlock.value ? 'Block updated.' : 'Block created.',
      life: 10000,
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
    <!-- <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Inventory</p>
        <h3>{{ data?.data.total ?? 0 }} blocks</h3>
        <p>Wing structures used by flats, billing, and resident occupancy mapping.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Active</p>
        <h3>{{ data?.data.items.filter((item) => item.isActive).length ?? 0 }}</h3>
        <p>Inactive blocks remain preserved for financial and occupancy history.</p>
      </section>
    </div> -->

    <div>
      <section class="list-page surface-card">
        <header class="list-page__header">
          <div>
            <h1>Blocks and wings</h1>
            <p>Manage block and wing master data.</p>
          </div>
          <div class="list-page__exports">
            <Button label="Create block" icon="pi pi-plus" @click="openCreateDialog" />
          </div>
        </header>

        <div class="list-page__toolbar">
          <IconField class="list-page__search">
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="globalSearch"
              placeholder="Search by block code or name"
            />
          </IconField>
          <div class="list-page__filters">
            <Select
              v-model="activeFilter"
              :options="[
                { label: 'All statuses', value: '' },
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
          :value="filteredBlocks"
          :loading="pending"
          responsive-layout="scroll"
          class="list-page__table"
          removable-sort
        >
          <Column field="code" header="Code" sortable />
          <Column field="name" header="Block" sortable />
          <Column field="description" header="Description" sortable>
            <template #body="{ data: row }">
              <span>{{ row.description || '—' }}</span>
            </template>
          </Column>
          <Column field="sortOrder" header="Sort Order" sortable />
          <Column field="flatCount" header="Flats" sortable />
          <Column field="isActive" header="Status" sortable>
            <template #body="{ data: row }">
              <AppStatusBadge :status="row.isActive ? 'active' : 'inactive'" />
            </template>
          </Column>
          <Column header="Actions" class="text-right" style="width: 100px">
            <template #body="{ data: row }">
              <Button
                icon="pi pi-pencil"
                severity="secondary"
                text
                rounded
                @click="editBlock(row)"
              />
            </template>
          </Column>
        </DataTable>
      </section>
    </div>

    <Dialog
      v-model:visible="displayDialog"
      :header="selectedBlock ? 'Edit Block' : 'Create Block'"
      modal
      class="p-dialog-custom"
      :style="{ width: '450px' }"
      :pt="{
        root: { style: { borderRadius: 'var(--radius-lg)', overflow: 'hidden' } }
      }"
    >
      <form class="admin-form-layout" style="padding: 1.5rem 0 0;" @submit.prevent="submit">
        <div class="admin-form-grid">
          <label>
            <span>Code</span>
            <InputText v-model="form.code" required />
          </label>
          <label>
            <span>Name</span>
            <InputText v-model="form.name" required />
          </label>
          <label class="admin-form-grid__full">
            <span>Description</span>
            <Textarea v-model="form.description" rows="3" auto-resize />
          </label>
          <label>
            <span>Flats in block</span>
            <InputNumber :model-value="selectedBlockFlatCount" disabled fluid />
            <small class="table-muted">
              Flat count is auto-calculated from linked flats in <strong>Flats</strong>.
            </small>
          </label>
          <label>
            <span>Sort order</span>
            <InputNumber v-model="form.sortOrder" :min="0" fluid />
          </label>
          <label class="admin-toggle-card">
            <span>Active block</span>
            <ToggleSwitch v-model="form.isActive" />
          </label>
        </div>

        <div class="admin-inline-actions" style="justify-content: flex-end; margin-top: 2rem; gap: 0.75rem;">
          <Button type="button" label="Cancel" severity="secondary" outlined @click="closeDialog" />
          <Button type="submit" :label="selectedBlock ? 'Update block' : 'Create block'" :loading="saving" />
        </div>
      </form>
    </Dialog>
  </div>
</template>
