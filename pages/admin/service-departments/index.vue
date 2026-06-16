<script setup lang="ts">
import type { ServiceDepartment } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Service Departments',
})

type StaffOption = { id: string; fullName: string; email: string }

const api = useApi()
const toast = useToast()
const dialogVisible = ref(false)
const saving = ref(false)
const selectedDepartment = ref<ServiceDepartment | null>(null)

const form = reactive({
  code: '',
  name: '',
  description: '',
  isActive: true,
  allowsQueueVisibility: true,
  staffIds: [] as string[],
  primaryStaffId: null as string | null,
})

const { data, pending, refresh } = await useAsyncData('admin-service-departments', () =>
  api<{ ok: true; data: { departments: ServiceDepartment[]; staff: StaffOption[] } }>('/api/admin/service-departments'),
)

const departments = computed(() => data.value?.data.departments ?? [])
const staff = computed(() => data.value?.data.staff ?? [])

const resetForm = () => {
  selectedDepartment.value = null
  form.code = ''
  form.name = ''
  form.description = ''
  form.isActive = true
  form.allowsQueueVisibility = true
  form.staffIds = []
  form.primaryStaffId = null
}

const openCreate = () => {
  resetForm()
  dialogVisible.value = true
}

const openEdit = (department: ServiceDepartment) => {
  selectedDepartment.value = department
  form.code = department.code
  form.name = department.name
  form.description = department.description ?? ''
  form.isActive = department.isActive
  form.allowsQueueVisibility = department.allowsQueueVisibility
  form.staffIds = department.staffAssignments?.filter((item) => item.isActive).map((item) => item.userId) ?? []
  form.primaryStaffId = department.staffAssignments?.find((item) => item.isPrimary && item.isActive)?.userId ?? null
  dialogVisible.value = true
}

const submit = async () => {
  saving.value = true

  try {
    const payload = {
      code: form.code,
      name: form.name,
      description: form.description || null,
      isActive: form.isActive,
      allowsQueueVisibility: form.allowsQueueVisibility,
      staffAssignments: form.staffIds.map((userId) => ({
        userId,
        isPrimary: userId === form.primaryStaffId,
        isActive: true,
      })),
    }

    if (selectedDepartment.value) {
      await api(`/api/admin/service-departments/${selectedDepartment.value.id}`, {
        method: 'PATCH',
        body: payload,
      })
    } else {
      await api('/api/admin/service-departments', {
        method: 'POST',
        body: payload,
      })
    }

    toast.add({ severity: 'success', summary: 'Saved', detail: 'Service department updated.', life: 2500 })
    dialogVisible.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

const deactivate = async (department: ServiceDepartment) => {
  await api(`/api/admin/service-departments/${department.id}`, { method: 'DELETE' })
  toast.add({ severity: 'success', summary: 'Department inactive', detail: 'Department was deactivated.', life: 2500 })
  await refresh()
}
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Service departments</h1>
          <p>Configure work teams, queue visibility, and service-staff mappings.</p>
        </div>
        <div class="list-page__exports">
          <Button label="Add department" icon="pi pi-plus" @click="openCreate" />
        </div>
      </header>

      <DataTable :value="departments" :loading="pending" responsive-layout="scroll" class="list-page__table">
        <Column field="name" header="Department">
          <template #body="{ data: row }">
            <div class="ticket-table-stack">
              <strong>{{ row.name }}</strong>
              <span>{{ row.code }}</span>
            </div>
          </template>
        </Column>
        <Column field="staffCount" header="Staff" />
        <Column field="openTicketCount" header="Open tickets" />
        <Column header="Queue">
          <template #body="{ data: row }">
            <AppStatusBadge :status="row.allowsQueueVisibility ? 'active' : 'inactive'" />
          </template>
        </Column>
        <Column header="State">
          <template #body="{ data: row }">
            <AppStatusBadge :status="row.isActive ? 'active' : 'inactive'" />
          </template>
        </Column>
        <Column header="Actions" style="width: 120px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions">
              <Button icon="pi pi-pencil" text rounded aria-label="Edit department" @click="openEdit(row)" />
              <Button icon="pi pi-ban" text rounded severity="danger" aria-label="Deactivate department" @click="deactivate(row)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <Dialog v-model:visible="dialogVisible" modal :header="selectedDepartment ? 'Edit department' : 'Add department'" :style="{ width: '720px', maxWidth: '95vw' }">
      <form class="admin-form-layout" style="padding-top: 1rem;" @submit.prevent="submit">
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
          <label class="admin-form-grid__full">
            <span>Service staff</span>
            <MultiSelect v-model="form.staffIds" :options="staff" option-label="fullName" option-value="id" display="chip" fluid />
          </label>
          <label class="admin-form-grid__full">
            <span>Primary staff</span>
            <Select
              v-model="form.primaryStaffId"
              :options="staff.filter((item) => form.staffIds.includes(item.id))"
              option-label="fullName"
              option-value="id"
              show-clear
              fluid
            />
          </label>
        </div>
        <div class="admin-toggle-grid">
          <label class="admin-toggle-card">
            <span>Active</span>
            <ToggleSwitch v-model="form.isActive" />
          </label>
          <label class="admin-toggle-card">
            <span>Department queue visible</span>
            <ToggleSwitch v-model="form.allowsQueueVisibility" />
          </label>
        </div>
        <div class="admin-inline-actions" style="justify-content: flex-end;">
          <Button type="button" label="Cancel" severity="secondary" outlined @click="dialogVisible = false" />
          <Button type="submit" label="Save department" icon="pi pi-save" :loading="saving" />
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
.ticket-table-stack {
  display: grid;
  gap: 0.15rem;
}

.ticket-table-stack span {
  color: var(--color-muted);
  font-size: 0.85rem;
}
</style>
