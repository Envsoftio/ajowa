<script setup lang="ts">
import type { ProfessionSummary } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Professions',
})

const api = useApi()
const toast = useToast()
const confirmAction = useAppConfirm()

const selectedProfession = ref<ProfessionSummary | null>(null)
const displayDialog = ref(false)
const saving = ref(false)
const deletingId = ref('')
const globalSearch = ref('')
const activeFilter = ref('')
const publicFilter = ref('')

const form = reactive({
  name: '',
  description: '',
  sortOrder: 0,
  isActive: true,
  isPublicAllowed: false,
})

const loadProfessions = () =>
  api<{ ok: true; data: { items: ProfessionSummary[]; total: number } }>(
    '/api/admin/professions',
    {
      query: {
        page: 1,
        pageSize: 500,
        sortBy: 'sortOrder',
        sortDirection: 'asc',
      },
    },
  )

const { data, pending, refresh } = await useAsyncData(
  'admin-professions',
  loadProfessions,
)

const professions = computed(() => data.value?.data.items ?? [])

const filteredProfessions = computed(() => {
  let list = professions.value
  const search = globalSearch.value.trim().toLowerCase()

  if (search) {
    list = list.filter(
      (profession) =>
        profession.name.toLowerCase().includes(search) ||
        (profession.description ?? '').toLowerCase().includes(search),
    )
  }

  if (activeFilter.value !== '') {
    const isActive = activeFilter.value === 'true'
    list = list.filter((profession) => profession.isActive === isActive)
  }

  if (publicFilter.value !== '') {
    const isPublicAllowed = publicFilter.value === 'true'
    list = list.filter(
      (profession) => profession.isPublicAllowed === isPublicAllowed,
    )
  }

  return list
})

const resetForm = () => {
  selectedProfession.value = null
  form.name = ''
  form.description = ''
  form.sortOrder = 0
  form.isActive = true
  form.isPublicAllowed = false
}

const openCreateDialog = () => {
  resetForm()
  displayDialog.value = true
}

const editProfession = (profession: ProfessionSummary) => {
  selectedProfession.value = profession
  form.name = profession.name
  form.description = profession.description ?? ''
  form.sortOrder = profession.sortOrder
  form.isActive = profession.isActive
  form.isPublicAllowed = profession.isPublicAllowed
  displayDialog.value = true
}

const closeDialog = () => {
  displayDialog.value = false
  resetForm()
}

const submit = async () => {
  saving.value = true

  try {
    const payload = {
      ...form,
      description: form.description || null,
    }

    if (selectedProfession.value) {
      await api(`/api/admin/professions/${selectedProfession.value.id}`, {
        method: 'PATCH',
        body: payload,
      })
    } else {
      await api('/api/admin/professions', {
        method: 'POST',
        body: payload,
      })
    }

    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: selectedProfession.value
        ? 'Profession updated.'
        : 'Profession created.',
      life: 6000,
    })
    closeDialog()
    await refresh()
  } finally {
    saving.value = false
  }
}

const deleteProfession = async (profession: ProfessionSummary) => {
  const linkedCount =
    profession.linkedProfileCount ?? profession.residentProfileCount ?? 0

  if (linkedCount > 0) {
    toast.add({
      severity: 'warn',
      summary: 'Profession is linked',
      detail:
        'This profession has resident history. Mark it inactive instead of deleting it.',
      life: 7000,
    })
    return
  }

  const confirmed = await confirmAction({
    header: 'Delete profession',
    message: `Delete ${profession.name}? This cannot be undone.`,
    icon: 'pi pi-trash',
    acceptLabel: 'Delete',
    acceptSeverity: 'danger',
  })

  if (!confirmed) {
    return
  }

  deletingId.value = profession.id

  try {
    await api(`/api/admin/professions/${profession.id}`, {
      method: 'DELETE',
    })
    toast.add({
      severity: 'success',
      summary: 'Deleted',
      detail: 'Profession removed.',
      life: 6000,
    })
    await refresh()
  } finally {
    deletingId.value = ''
  }
}
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Professions</h1>
          <p>Manage resident profession master data and member visibility.</p>
        </div>
        <div class="list-page__exports">
          <Button
            label="Create profession"
            icon="pi pi-plus"
            @click="openCreateDialog"
          />
        </div>
      </header>

      <div class="list-page__toolbar">
        <IconField class="list-page__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="globalSearch" placeholder="Search professions" />
        </IconField>
        <div class="list-page__filters">
          <Select
            v-model="activeFilter"
            :options="[
              { label: 'All statuses', value: '' },
              { label: 'Active only', value: 'true' },
              { label: 'Inactive only', value: 'false' },
            ]"
            option-label="label"
            option-value="value"
            placeholder="Active state"
          />
          <Select
            v-model="publicFilter"
            :options="[
              { label: 'All visibility', value: '' },
              { label: 'Directory allowed', value: 'true' },
              { label: 'Internal only', value: 'false' },
            ]"
            option-label="label"
            option-value="value"
            placeholder="Directory visibility"
          />
        </div>
      </div>

      <AppDataTable
        :value="filteredProfessions"
        :loading="pending"
        responsive-layout="scroll"
        class="list-page__table"
        removable-sort
      >
        <Column field="name" header="Profession" sortable />
        <Column field="description" header="Description">
          <template #body="{ data: row }">
            {{ row.description || '-' }}
          </template>
        </Column>
        <Column field="sortOrder" header="Sort" sortable />
        <Column header="Residents">
          <template #body="{ data: row }">
            {{ row.residentProfileCount ?? 0 }}
          </template>
        </Column>
        <Column header="Public">
          <template #body="{ data: row }">
            {{ row.publicProfileCount ?? 0 }}
          </template>
        </Column>
        <Column field="isPublicAllowed" header="Directory" sortable>
          <template #body="{ data: row }">
            <Tag
              :value="row.isPublicAllowed ? 'Allowed' : 'Internal'"
              :severity="row.isPublicAllowed ? 'success' : 'secondary'"
              rounded
            />
          </template>
        </Column>
        <Column field="isActive" header="Status" sortable>
          <template #body="{ data: row }">
            <AppStatusBadge :status="row.isActive ? 'active' : 'inactive'" />
          </template>
        </Column>
        <Column header="Actions" class="text-right" style="width: 140px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions" style="justify-content: flex-end">
              <Button
                icon="pi pi-pencil"
                severity="secondary"
                text
                rounded
                aria-label="Edit profession"
                @click="editProfession(row)"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                aria-label="Delete profession"
                :loading="deletingId === row.id"
                @click="deleteProfession(row)"
              />
            </div>
          </template>
        </Column>
      </AppDataTable>
    </section>

    <Dialog
      v-model:visible="displayDialog"
      :header="selectedProfession ? 'Edit Profession' : 'Create Profession'"
      modal
      class="p-dialog-custom"
      :style="{ width: '520px', maxWidth: '95vw' }"
      :pt="{
        root: {
          style: { borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
        },
      }"
    >
      <form
        class="admin-form-layout"
        style="padding: 1.5rem 0 0"
        @submit.prevent="submit"
      >
        <div class="admin-form-grid">
          <label class="admin-form-grid__full">
            <span>Name</span>
            <InputText v-model="form.name" required />
          </label>
          <label class="admin-form-grid__full">
            <span>Description</span>
            <Textarea v-model="form.description" rows="3" auto-resize />
          </label>
          <label>
            <span>Sort order</span>
            <InputNumber v-model="form.sortOrder" :min="0" fluid />
          </label>
          <label class="admin-toggle-card">
            <span>Active</span>
            <ToggleSwitch v-model="form.isActive" />
          </label>
          <label class="admin-toggle-card admin-form-grid__full">
            <span>Allow in member directory</span>
            <ToggleSwitch v-model="form.isPublicAllowed" />
          </label>
        </div>

        <div
          class="admin-inline-actions"
          style="justify-content: flex-end; margin-top: 2rem; gap: 0.75rem"
        >
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            outlined
            @click="closeDialog"
          />
          <Button
            type="submit"
            :label="
              selectedProfession ? 'Update profession' : 'Create profession'
            "
            :loading="saving"
          />
        </div>
      </form>
    </Dialog>
  </div>
</template>
