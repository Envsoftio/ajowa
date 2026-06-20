<script setup lang="ts">
import type { ListQueryParams } from '~/types/api'

type SetupTask = {
  id: string
  task: string
  owner: string
  status: string
  area: string
}

definePageMeta({
  layout: 'admin',
  title: 'Setup',
})

const toast = useToast()

const seededTasks: SetupTask[] = [
  { id: 'st-01', task: 'Resident import', owner: 'Ops Team', status: 'active', area: 'Delivery' },
  { id: 'st-02', task: 'Finance rules', owner: 'Manager', status: 'pending', area: 'Finance' },
  { id: 'st-03', task: 'Guard QR flow', owner: 'Security Desk', status: 'blocked', area: 'Access' },
  { id: 'st-04', task: 'Theme tokens', owner: 'Frontend', status: 'paid', area: 'UI' },
  { id: 'st-05', task: 'Audit helpers', owner: 'Platform', status: 'open', area: 'API' },
]

const query = ref<ListQueryParams>({
  page: 1,
  pageSize: 5,
  search: '',
  sortBy: 'task',
  sortDirection: 'asc',
  filters: {},
})

const rows = ref<SetupTask[]>(structuredClone(seededTasks))
const form = reactive({
  id: '',
  task: '',
  owner: '',
  status: 'active',
  area: '',
})

const showDialog = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)

const statusOptions = ['active', 'pending', 'blocked', 'paid', 'open']

const resetForm = () => {
  form.id = ''
  form.task = ''
  form.owner = ''
  form.status = 'active'
  form.area = ''
}

const openCreate = () => {
  editingId.value = null
  resetForm()
  showDialog.value = true
}

const openEdit = (task: SetupTask) => {
  editingId.value = task.id
  form.id = task.id
  form.task = task.task
  form.owner = task.owner
  form.status = task.status
  form.area = task.area
  showDialog.value = true
}

const closeDialog = () => {
  showDialog.value = false
  resetForm()
  editingId.value = null
}

const saveTask = async () => {
  saving.value = true
  try {
    const isEditing = Boolean(editingId.value)
    const payload = {
      id: editingId.value || crypto.randomUUID(),
      task: form.task.trim(),
      owner: form.owner.trim(),
      status: form.status,
      area: form.area.trim(),
    }

    if (isEditing) {
      rows.value = rows.value.map((task) =>
        task.id === editingId.value ? { ...task, ...payload } : task,
      )
    } else {
      rows.value = [payload, ...rows.value]
    }

    closeDialog()
    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: isEditing ? 'Task updated.' : 'Task created.',
      life: 10000,
    })
  } finally {
    saving.value = false
  }
}

const rowsFiltered = computed(() => {
  const search = query.value.search?.toLowerCase()
  const filtered = search
    ? rows.value.filter((item) =>
        [item.task, item.owner, item.status, item.area].some((value) =>
          value.toLowerCase().includes(search),
        ),
      )
    : rows.value

  return filtered
})

const columns = [
  { field: 'task', header: 'Task', sortable: true },
  { field: 'owner', header: 'Owner', sortable: true },
  { field: 'status', header: 'Status', sortable: true, kind: 'status' as const },
  { field: 'area', header: 'Area', sortable: true },
  { field: 'actions', header: 'Actions', sortable: false },
]

const updateQuery = (value: ListQueryParams) => {
  query.value = value
}
</script>

<template>
  <div class="landing-page">
    <AppListPage
      title="Completion Tracker"
      description="Track setup tasks with search, status badges, pagination hooks, and mobile cards."
      :rows="rowsFiltered"
      :columns="columns"
      :query="query"
      :total-records="rowsFiltered.length"
      search-placeholder="Search setup tasks"
      :export-actions="[{ label: 'Export XLSX', key: 'xlsx' }, { label: 'Export PDF', key: 'pdf' }]"
      @query="updateQuery"
    >
      <template #actions>
        <Button label="Add task" icon="pi pi-plus" @click="openCreate" />
      </template>

      <template #summary>
        <div class="list-page-summary">
          <AppStatusBadge status="active" />
          <AppStatusBadge status="pending" />
          <AppStatusBadge status="blocked" />
        </div>
      </template>

      <template #cell-status="{ value }">
        <AppStatusBadge :status="String(value)" />
      </template>

      <template #cell-actions="{ row }">
        <div class="admin-inline-actions" style="justify-content: flex-end; gap: 0.5rem;">
          <Button
            icon="pi pi-pencil"
            severity="secondary"
            text
            rounded
            aria-label="Edit setup task"
            @click="openEdit(row as SetupTask)"
          />
        </div>
      </template>
    </AppListPage>

    <Dialog
      v-model:visible="showDialog"
      :header="editingId ? 'Edit setup task' : 'Create setup task'"
      modal
      class="p-dialog-custom"
      :style="{ width: '460px' }"
    >
      <form class="admin-form-layout" style="padding-top: 1.25rem;" @submit.prevent="saveTask">
        <div class="admin-form-grid">
          <label>
            <span>Task</span>
            <InputText v-model="form.task" required />
          </label>
          <label>
            <span>Owner</span>
            <InputText v-model="form.owner" required />
          </label>
          <label>
            <span>Area</span>
            <InputText v-model="form.area" required />
          </label>
          <label>
            <span>Status</span>
            <Select v-model="form.status" :options="statusOptions" />
          </label>
        </div>

        <div class="admin-inline-actions" style="justify-content: flex-end; margin-top: 1.5rem; gap: 0.75rem;">
          <Button type="button" label="Cancel" severity="secondary" outlined @click="closeDialog" />
          <Button type="submit" :loading="saving" :label="editingId ? 'Update task' : 'Create task'" />
        </div>
      </form>
    </Dialog>
  </div>
</template>
