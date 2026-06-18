<script setup lang="ts">
import type { DataTablePageEvent, DataTableSortEvent } from 'primevue/datatable'
import type { ListQueryParams } from '~/types/api'
import type { StaffSummary } from '~/types/domain'
import { staffPermissionLabels, staffPermissions, type StaffPermission } from '~/shared/permissions'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Staff',
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

const selectedStaff = ref<StaffSummary | null>(null)
const displayDialog = ref(false)
const saving = ref(false)
const resettingLoginId = ref<string | null>(null)
const removingStaffId = ref<string | null>(null)
const globalSearch = ref('')
const loginDetails = ref<StaffLoginDetails | null>(null)
const loginDialogVisible = ref(false)

type StaffLoginDetails = {
  email: string
  temporaryPassword: string
  loginUrl: string
  requiresPasswordChange: boolean
}

const form = reactive({
  role: 'MANAGER' as StaffSummary['role'],
  fullName: '',
  email: '',
  mobileNumber: '',
  whatsappNumber: '',
  temporaryPassword: '',
  canLogin: true,
  isActive: true,
  permissions: [] as StaffPermission[],
})

const permissionOptions = staffPermissions.map((permission) => ({
  label: staffPermissionLabels[permission],
  value: permission,
}))

const loadStaff = () =>
  api<{ ok: true; data: { items: StaffSummary[]; total: number } }>('/api/admin/staff', {
    query: {
      page: query.value.page,
      pageSize: query.value.pageSize,
      search: query.value.search,
      sortBy: query.value.sortBy,
      sortDirection: query.value.sortDirection,
      role: query.value.filters.role?.[0],
      canLogin: query.value.filters.canLogin?.[0],
      isActive: query.value.filters.isActive?.[0],
    },
  })

const { data, pending, refresh } = await useAsyncData('admin-staff', loadStaff, {
  watch: [query],
})

const resetForm = () => {
  selectedStaff.value = null
  form.role = 'MANAGER'
  form.fullName = ''
  form.email = ''
  form.mobileNumber = ''
  form.whatsappNumber = ''
  form.temporaryPassword = generateTemporaryPassword()
  form.canLogin = true
  form.isActive = true
  form.permissions = []
}

const openCreateDialog = () => {
  resetForm()
  displayDialog.value = true
}

const editStaff = (staff: StaffSummary) => {
  selectedStaff.value = staff
  form.role = staff.role
  form.fullName = staff.fullName
  form.email = staff.email
  form.mobileNumber = staff.mobileNumber
  form.whatsappNumber = staff.whatsappNumber ?? ''
  form.temporaryPassword = ''
  form.canLogin = staff.canLogin
  form.isActive = staff.isActive
  form.permissions = staff.permissions.filter((permission): permission is StaffPermission =>
    staffPermissions.includes(permission as StaffPermission),
  )
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
      role: form.role,
      fullName: form.fullName,
      mobileNumber: form.mobileNumber,
      whatsappNumber: form.whatsappNumber || null,
      canLogin: form.canLogin,
      isActive: form.isActive,
      permissions: form.permissions,
      ...(selectedStaff.value
        ? {}
        : {
            email: form.email,
            temporaryPassword: form.temporaryPassword,
          }),
    }

    if (selectedStaff.value) {
      await api(`/api/admin/staff/${selectedStaff.value.id}`, {
        method: 'PATCH',
        body: payload,
      })
    } else {
      const response = await api<{ ok: true; data: StaffLoginDetails }>('/api/admin/staff', {
        method: 'POST',
        body: payload,
      })
      loginDetails.value = response.data
      loginDialogVisible.value = true
    }

    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: selectedStaff.value ? 'Staff member updated.' : 'Staff member created.',
      life: 10000,
    })
    closeDialog()
    await refresh()
  } finally {
    saving.value = false
  }
}

const generateTemporaryPassword = () => {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return `Ajowa@${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}2026`
}

const regenerateTemporaryPassword = () => {
  form.temporaryPassword = generateTemporaryPassword()
}

const resetStaffLogin = async (staff: StaffSummary) => {
  const confirmed = await confirmAction({
    header: 'Reset staff login?',
    message: `Reset login for ${staff.fullName}? This creates a new temporary password and requires a password change at next sign-in.`,
    acceptLabel: 'Reset login',
    acceptSeverity: 'warn',
  })

  if (!confirmed) {
    return
  }

  resettingLoginId.value = staff.id

  try {
    const response = await api<{ ok: true; data: StaffLoginDetails }>(`/api/admin/staff/${staff.id}/login-reset`, {
      method: 'POST',
      body: {
        temporaryPassword: generateTemporaryPassword(),
      },
    })

    loginDetails.value = response.data
    loginDialogVisible.value = true

    toast.add({
      severity: 'success',
      summary: 'Login reset',
      detail: 'Temporary login details are ready.',
      life: 10000,
    })

    await refresh()
  } finally {
    resettingLoginId.value = null
  }
}

const removeStaff = async (staff: StaffSummary) => {
  const confirmed = await confirmAction({
    header: 'Remove staff member?',
    message:
      `Remove ${staff.fullName}? Their login will be revoked and they will no longer appear in the staff registry. ` +
      'Historical activity stays on record.',
    acceptLabel: 'Remove staff',
    acceptSeverity: 'danger',
  })

  if (!confirmed) {
    return
  }

  removingStaffId.value = staff.id

  try {
    await api(`/api/admin/staff/${staff.id}`, {
      method: 'DELETE',
    })

    toast.add({
      severity: 'success',
      summary: 'Removed',
      detail: 'Staff member removed.',
      life: 10000,
    })

    await refresh()
  } finally {
    removingStaffId.value = null
  }
}

const loginInstructions = computed(() => {
  if (!loginDetails.value) {
    return ''
  }

  return [
    `Login URL: ${loginDetails.value.loginUrl}`,
    `Email: ${loginDetails.value.email}`,
    `Temporary password: ${loginDetails.value.temporaryPassword}`,
    'They must change this password after signing in.',
  ].join('\n')
})

const copyLoginInstructions = async () => {
  if (!loginInstructions.value) {
    return
  }

  await navigator.clipboard?.writeText(loginInstructions.value)
  toast.add({
    severity: 'success',
    summary: 'Copied',
    detail: 'Login details copied.',
    life: 10000,
  })
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

const onSearch = () => {
  updateQuery({
    ...query.value,
    page: 1,
    search: globalSearch.value.trim(),
  })
}

const roleFilter = computed({
  get: () => query.value.filters.role?.[0] ?? '',
  set: (val) => {
    updateQuery({
      ...query.value,
      page: 1,
      filters: { ...query.value.filters, role: val ? [val] : [] },
    })
  },
})

const activeFilter = computed({
  get: () => query.value.filters.isActive?.[0] ?? '',
  set: (val) => {
    updateQuery({
      ...query.value,
      page: 1,
      filters: { ...query.value.filters, isActive: val ? [val] : [] },
    })
  },
})

const loginFilter = computed({
  get: () => query.value.filters.canLogin?.[0] ?? '',
  set: (val) => {
    updateQuery({
      ...query.value,
      page: 1,
      filters: { ...query.value.filters, canLogin: val ? [val] : [] },
    })
  },
})

const permissionLabel = (permission: string) =>
  staffPermissionLabels[permission as StaffPermission] ?? permission
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Staff registry</h1>
          <p>Admin-managed staff accounts with route-level permissions.</p>
        </div>
        <div class="list-page__exports">
          <Button label="Add staff" icon="pi pi-plus" @click="openCreateDialog" />
        </div>
      </header>

      <div class="list-page__toolbar">
        <IconField class="list-page__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="globalSearch" placeholder="Search staff by name, email, or mobile" @keydown.enter="onSearch" />
        </IconField>
        <div class="list-page__filters">
          <Select
            v-model="roleFilter"
            :options="[
              { label: 'All roles', value: '' },
              { label: 'Manager', value: 'MANAGER' },
              { label: 'Service Staff', value: 'SERVICE_STAFF' },
              { label: 'Guard', value: 'GUARD' }
            ]"
            option-label="label"
            option-value="value"
            placeholder="Role"
          />
          <Select
            v-model="loginFilter"
            :options="[
              { label: 'All logins', value: '' },
              { label: 'Login enabled', value: 'true' },
              { label: 'Login disabled', value: 'false' }
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
              { label: 'Inactive only', value: 'false' }
            ]"
            option-label="label"
            option-value="value"
            placeholder="Active state"
          />
          <Button label="Search" @click="onSearch" />
        </div>
      </div>

      <DataTable
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
        <Column field="fullName" header="Staff member" sortable />
        <Column field="role" header="Role" sortable />
        <Column field="email" header="Email" sortable />
        <Column header="Permissions">
          <template #body="{ data: row }">
            <div class="admin-inline-actions" style="gap: 0.35rem; flex-wrap: wrap;">
              <Tag
                v-for="permission in row.permissions.slice(0, 3)"
                :key="permission"
                severity="secondary"
                :value="permissionLabel(permission)"
                rounded
              />
              <Tag v-if="row.permissions.length > 3" severity="contrast" :value="`+${row.permissions.length - 3}`" rounded />
            </div>
          </template>
        </Column>
        <Column field="canLogin" header="Login" sortable>
          <template #body="{ data: row }">
            <AppStatusBadge :status="row.canLogin ? 'active' : 'inactive'" />
          </template>
        </Column>
        <Column header="Actions" class="text-right" style="width: 170px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions" style="justify-content: flex-end; gap: 0.25rem;">
              <Button
                icon="pi pi-key"
                severity="secondary"
                text
                rounded
                aria-label="Reset staff login"
                :loading="resettingLoginId === row.id"
                :disabled="removingStaffId === row.id"
                @click="resetStaffLogin(row)"
              />
              <Button
                icon="pi pi-pencil"
                severity="secondary"
                text
                rounded
                aria-label="Edit staff"
                :disabled="removingStaffId === row.id"
                @click="editStaff(row)"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                aria-label="Remove staff"
                :loading="removingStaffId === row.id"
                @click="removeStaff(row)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <Dialog
      v-model:visible="displayDialog"
      :header="selectedStaff ? 'Edit Staff' : 'Add Staff'"
      modal
      class="p-dialog-custom"
      :style="{ width: '760px', maxWidth: '95vw' }"
    >
      <form class="admin-form-layout" style="padding: 1.5rem 0.5rem 0;" @submit.prevent="submit">
        <section class="admin-form-subsection">
          <h3>Account</h3>
          <div class="admin-form-grid">
            <label>
              <span>Full name</span>
              <InputText v-model="form.fullName" required />
            </label>
            <label>
              <span>Email</span>
              <InputText v-model="form.email" type="email" required :disabled="!!selectedStaff" />
            </label>
            <label>
              <span>Mobile</span>
              <InputText v-model="form.mobileNumber" required />
            </label>
            <label>
              <span>WhatsApp</span>
              <InputText v-model="form.whatsappNumber" />
            </label>
            <label>
              <span>Role</span>
              <Select v-model="form.role" :options="['MANAGER', 'SERVICE_STAFF', 'GUARD']" required />
            </label>
            <label v-if="!selectedStaff" class="admin-form-grid__full">
              <span>Temporary password</span>
              <InputGroup>
                <InputText v-model="form.temporaryPassword" required autocomplete="new-password" />
                <Button type="button" icon="pi pi-refresh" severity="secondary" outlined aria-label="Generate temporary password" @click="regenerateTemporaryPassword" />
              </InputGroup>
            </label>
          </div>
          <div v-if="!selectedStaff" class="auth-banner auth-banner-info">
            Staff sign in at /login with this temporary password, then AJOWA forces a password change before protected access.
          </div>
        </section>

        <section class="admin-form-subsection">
          <h3>Permissions</h3>
          <MultiSelect
            v-model="form.permissions"
            :options="permissionOptions"
            option-label="label"
            option-value="value"
            display="chip"
            placeholder="Choose permissions"
            fluid
          />
        </section>

        <div class="admin-toggle-grid">
          <label class="admin-toggle-card">
            <span>Login enabled</span>
            <ToggleSwitch v-model="form.canLogin" />
          </label>
          <label class="admin-toggle-card">
            <span>Active</span>
            <ToggleSwitch v-model="form.isActive" />
          </label>
        </div>

        <div class="admin-inline-actions" style="justify-content: flex-end; margin-top: 1.5rem; gap: 0.75rem;">
          <Button type="button" label="Cancel" severity="secondary" outlined @click="closeDialog" />
          <Button type="submit" :label="saving ? 'Saving…' : 'Save staff'" :loading="saving" />
        </div>
      </form>
    </Dialog>

    <Dialog
      v-model:visible="loginDialogVisible"
      header="Staff Login Details"
      modal
      class="p-dialog-custom"
      :style="{ width: '560px', maxWidth: '95vw' }"
    >
      <div v-if="loginDetails" class="admin-form-layout" style="padding-top: 1rem;">
        <div class="auth-banner auth-banner-warning">
          Share these details directly with the staff member. The password is only shown here.
        </div>
        <div class="staff-login-details">
          <label>
            <span>Login URL</span>
            <strong>{{ loginDetails.loginUrl }}</strong>
          </label>
          <label>
            <span>Email</span>
            <strong>{{ loginDetails.email }}</strong>
          </label>
          <label>
            <span>Temporary password</span>
            <strong>{{ loginDetails.temporaryPassword }}</strong>
          </label>
        </div>
        <div class="admin-inline-actions" style="justify-content: flex-end; gap: 0.75rem;">
          <Button type="button" label="Copy details" icon="pi pi-copy" severity="secondary" outlined @click="copyLoginInstructions" />
          <Button type="button" label="Done" @click="loginDialogVisible = false" />
        </div>
      </div>
    </Dialog>
  </div>
</template>
