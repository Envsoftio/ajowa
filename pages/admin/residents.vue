<script setup lang="ts">
import type { DataTablePageEvent, DataTableSortEvent } from 'primevue/datatable'
import type { ListQueryParams } from '~/types/api'
import type { FlatSummary, ResidentDetail, ResidentSummary } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Residents',
})

const api = useApi()
const toast = useToast()

const query = ref<ListQueryParams>({
  page: 1,
  pageSize: 10,
  search: '',
  sortBy: 'fullName',
  sortDirection: 'asc',
  filters: {},
})

const selectedResident = ref<ResidentSummary | null>(null)
const displayDialog = ref(false)
const form = reactive({
  role: 'RESIDENT',
  fullName: '',
  email: '',
  mobileNumber: '',
  whatsappNumber: '',
  isWhatsappSameAsMobile: true,
  profileImagePath: '',
  emergencyContactName: '',
  emergencyContactNumber: '',
  governmentIdType: '',
  governmentIdNumber: '',
  governmentIdDocumentPath: '',
  ownershipProofPath: '',
  leaseAgreementPath: '',
  kycStatus: 'PENDING',
  policeVerificationStatus: 'PENDING',
  canLogin: true,
  isActive: true,
  sendInvite: false,
  preferredNotificationChannels: 'ALL_CHANNELS',
  relationships: [
    {
      id: undefined as string | undefined,
      flatId: '',
      relationshipType: 'OWNER',
      isPrimaryContact: true,
      isBillingContact: true,
      canLogin: true,
      isActive: true,
      ownershipPercent: null as number | null,
      ownershipLabel: '',
      ownershipStartDate: '',
      leaseStartDate: '',
      leaseEndDate: '',
      contractStartDate: '',
      contractEndDate: '',
      occupancyStatus: 'SELF_OCCUPIED',
      accessScope: 'OWNERSHIP',
      relationshipNote: '',
      securityDepositAmount: null as number | null,
      securityDepositNote: '',
    },
  ],
})

const { data: flatsData } = await useAsyncData('admin-flat-options', () =>
  api<{ ok: true; data: { items: FlatSummary[] } }>('/api/admin/flats', {
    query: { page: 1, pageSize: 200, sortBy: 'flatNumber', sortDirection: 'asc' },
  }),
)

const flatOptions = computed(() =>
  (flatsData.value?.data.items ?? []).map((item) => ({
    label: `${item.blockName} · ${item.flatNumber}`,
    value: item.id,
  })),
)

const loadResidents = () =>
  api<{ ok: true; data: { items: ResidentSummary[]; total: number } }>('/api/admin/residents', {
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

const { data, pending, refresh } = await useAsyncData('admin-residents', loadResidents, {
  watch: [query],
})

const addRelationship = () => {
  form.relationships.push({
    id: undefined,
    flatId: '',
    relationshipType: 'OWNER',
    isPrimaryContact: false,
    isBillingContact: false,
    canLogin: true,
    isActive: true,
    ownershipPercent: null,
    ownershipLabel: '',
    ownershipStartDate: '',
    leaseStartDate: '',
    leaseEndDate: '',
    contractStartDate: '',
    contractEndDate: '',
    occupancyStatus: 'VACANT',
    accessScope: 'OWNERSHIP',
    relationshipNote: '',
    securityDepositAmount: null,
    securityDepositNote: '',
  })
}

const removeRelationship = (index: number) => {
  form.relationships.splice(index, 1)
}

const resetForm = () => {
  selectedResident.value = null
  form.role = 'RESIDENT'
  form.fullName = ''
  form.email = ''
  form.mobileNumber = ''
  form.whatsappNumber = ''
  form.isWhatsappSameAsMobile = true
  form.profileImagePath = ''
  form.emergencyContactName = ''
  form.emergencyContactNumber = ''
  form.governmentIdType = ''
  form.governmentIdNumber = ''
  form.governmentIdDocumentPath = ''
  form.ownershipProofPath = ''
  form.leaseAgreementPath = ''
  form.kycStatus = 'PENDING'
  form.policeVerificationStatus = 'PENDING'
  form.canLogin = true
  form.isActive = true
  form.sendInvite = false
  form.preferredNotificationChannels = 'ALL_CHANNELS'
  form.relationships = [
    {
      id: undefined,
      flatId: '',
      relationshipType: 'OWNER',
      isPrimaryContact: true,
      isBillingContact: true,
      canLogin: true,
      isActive: true,
      ownershipPercent: null,
      ownershipLabel: '',
      ownershipStartDate: '',
      leaseStartDate: '',
      leaseEndDate: '',
      contractStartDate: '',
      contractEndDate: '',
      occupancyStatus: 'SELF_OCCUPIED',
      accessScope: 'OWNERSHIP',
      relationshipNote: '',
      securityDepositAmount: null,
      securityDepositNote: '',
    },
  ]
}

const openCreateDialog = () => {
  resetForm()
  displayDialog.value = true
}

const closeDialog = () => {
  displayDialog.value = false
  resetForm()
}

const loadResident = async (resident: ResidentSummary) => {
  const response = await api<{ ok: true; data: ResidentDetail }>(`/api/admin/residents/${resident.id}`)
  const item = response.data
  selectedResident.value = resident
  form.role = item.role
  form.fullName = item.fullName
  form.email = item.email
  form.mobileNumber = item.mobileNumber
  form.whatsappNumber = item.whatsappNumber ?? ''
  form.isWhatsappSameAsMobile = item.isWhatsappSameAsMobile
  form.profileImagePath = item.profileImagePath ?? ''
  form.emergencyContactName = item.emergencyContactName ?? ''
  form.emergencyContactNumber = item.emergencyContactNumber ?? ''
  form.governmentIdType = item.governmentIdType ?? ''
  form.governmentIdNumber = item.governmentIdNumber ?? ''
  form.governmentIdDocumentPath = item.governmentIdDocumentPath ?? ''
  form.ownershipProofPath = item.ownershipProofPath ?? ''
  form.leaseAgreementPath = item.leaseAgreementPath ?? ''
  form.kycStatus = item.kycStatus
  form.policeVerificationStatus = item.policeVerificationStatus
  form.canLogin = item.canLogin
  form.isActive = item.isActive
  form.preferredNotificationChannels = item.preferredNotificationChannels
  form.relationships = item.relationships.map((relationship: ResidentDetail['relationships'][number]) => ({
    id: relationship.id,
    flatId: relationship.flatId,
    relationshipType: relationship.relationshipType,
    isPrimaryContact: relationship.isPrimaryContact,
    isBillingContact: relationship.isBillingContact,
    canLogin: relationship.canLogin,
    isActive: relationship.isActive,
    ownershipPercent: relationship.ownershipPercent,
    ownershipLabel: relationship.ownershipLabel ?? '',
    ownershipStartDate: relationship.ownershipStartDate ?? '',
    leaseStartDate: relationship.leaseStartDate ?? '',
    leaseEndDate: relationship.leaseEndDate ?? '',
    contractStartDate: relationship.contractStartDate ?? '',
    contractEndDate: relationship.contractEndDate ?? '',
    occupancyStatus: relationship.occupancyStatus ?? 'VACANT',
    accessScope: relationship.accessScope ?? 'OWNERSHIP',
    relationshipNote: relationship.relationshipNote ?? '',
    securityDepositAmount: relationship.securityDepositAmount,
    securityDepositNote: relationship.securityDepositNote ?? '',
  }))
  displayDialog.value = true
}

const saving = ref(false)

const submit = async () => {
  saving.value = true

  try {
    const payload = {
      ...form,
      whatsappNumber: form.isWhatsappSameAsMobile ? null : (form.whatsappNumber || null),
      profileImagePath: form.profileImagePath || null,
      emergencyContactName: form.emergencyContactName || null,
      emergencyContactNumber: form.emergencyContactNumber || null,
      governmentIdType: form.governmentIdType || null,
      governmentIdNumber: form.governmentIdNumber || null,
      governmentIdDocumentPath: form.governmentIdDocumentPath || null,
      ownershipProofPath: form.ownershipProofPath || null,
      leaseAgreementPath: form.leaseAgreementPath || null,
      relationships: form.relationships.map((relationship) => ({
        ...relationship,
        ownershipLabel: relationship.ownershipLabel || null,
        ownershipStartDate: relationship.ownershipStartDate || null,
        leaseStartDate: relationship.leaseStartDate || null,
        leaseEndDate: relationship.leaseEndDate || null,
        contractStartDate: relationship.contractStartDate || null,
        contractEndDate: relationship.contractEndDate || null,
        relationshipNote: relationship.relationshipNote || null,
        securityDepositNote: relationship.securityDepositNote || null,
      })),
    }

    if (selectedResident.value) {
      await api(`/api/admin/residents/${selectedResident.value.id}`, {
        method: 'PATCH',
        body: payload,
      })
    } else {
      await api('/api/admin/residents', {
        method: 'POST',
        body: payload,
      })
    }

    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: selectedResident.value ? 'Resident updated.' : 'Resident created.',
      life: 3000,
    })
    closeDialog()
    await refresh()
  } finally {
    saving.value = false
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

const roleFilter = computed({
  get: () => query.value.filters.role?.[0] ?? '',
  set: (val) => {
    updateQuery({
      ...query.value,
      page: 1,
      filters: {
        ...query.value.filters,
        role: val ? [val] : [],
      },
    })
  },
})

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
</script>

<template>
  <div class="landing-page">
   

    <div>
      <section class="list-page surface-card">
        <header class="list-page__header">
          <div>
            <h1>Resident registry</h1>
            <p>Resident CRUD with server-driven search, role filters, and account-state visibility.</p>
          </div>
          <div class="list-page__exports">
            <Button label="Create resident" icon="pi pi-plus" @click="openCreateDialog" />
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
              v-model="roleFilter"
              :options="[
                { label: 'All roles', value: '' },
                { label: 'Resident', value: 'RESIDENT' },
                { label: 'Admin', value: 'ADMIN' },
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
          <Column field="fullName" header="Resident" sortable />
          <Column field="role" header="Role" sortable />
          <Column field="email" header="Email" sortable />
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
              <div class="admin-inline-actions" style="justify-content: flex-end; gap: 0.5rem;">
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
                  @click="loadResident(row)"
                />
              </div>
            </template>
          </Column>
        </DataTable>
      </section>
    </div>

    <Dialog
      v-model:visible="displayDialog"
      :header="selectedResident ? 'Edit Resident' : 'Create Resident'"
      modal
      class="p-dialog-custom"
      :style="{ width: '900px', maxWidth: '95vw' }"
      :pt="{
        root: { style: { borderRadius: 'var(--radius-lg)', overflow: 'hidden' } }
      }"
    >
      <form class="admin-form-layout" style="padding: 1.5rem 0.5rem 0; max-height: 75vh; overflow-y: auto;" @submit.prevent="submit">
        <section class="admin-form-subsection">
          <h3>Account</h3>
          <div class="admin-form-grid">
            <label>
              <span>Full name</span>
              <InputText v-model="form.fullName" required />
            </label>
            <label>
              <span>Email</span>
              <InputText v-model="form.email" type="email" required />
            </label>
            <label>
              <span>Role</span>
              <Select v-model="form.role" :options="['RESIDENT', 'ADMIN', 'MANAGER', 'SERVICE_STAFF', 'GUARD']" required />
            </label>
            <label>
              <span>Notification preset</span>
              <Select v-model="form.preferredNotificationChannels" :options="['ALL_CHANNELS', 'PUSH_EMAIL_WHATSAPP', 'PUSH_AND_EMAIL', 'PUSH', 'EMAIL', 'WHATSAPP']" required />
            </label>
          </div>
        </section>

        <section class="admin-form-subsection">
          <h3>Identity and communication</h3>
          <div class="admin-form-grid">
            <label>
              <span>Mobile</span>
              <InputText v-model="form.mobileNumber" required />
            </label>
            <label>
              <span>WhatsApp</span>
              <InputText v-model="form.whatsappNumber" :disabled="form.isWhatsappSameAsMobile" />
            </label>
            <label class="admin-toggle-card">
              <span>WhatsApp same as mobile</span>
              <ToggleSwitch v-model="form.isWhatsappSameAsMobile" />
            </label>
            <label>
              <span>Profile image path</span>
              <InputText v-model="form.profileImagePath" />
            </label>
            <label>
              <span>Emergency contact name</span>
              <InputText v-model="form.emergencyContactName" />
            </label>
            <label>
              <span>Emergency contact number</span>
              <InputText v-model="form.emergencyContactNumber" />
            </label>
          </div>
        </section>

        <section class="admin-form-subsection">
          <div class="admin-form-section__header">
            <h3>Occupancy relationships</h3>
            <Button type="button" label="Add relationship" severity="secondary" outlined @click="addRelationship" />
          </div>

          <article v-for="(relationship, index) in form.relationships" :key="relationship.id ?? index" class="admin-relationship-card">
            <div class="admin-form-grid">
              <label>
                <span>Flat</span>
                <Select v-model="relationship.flatId" :options="flatOptions" option-label="label" option-value="value" required />
              </label>
              <label>
                <span>Relationship type</span>
                <Select v-model="relationship.relationshipType" :options="['OWNER', 'CO_OWNER', 'TENANT', 'FAMILY_MEMBER', 'SHOP_OWNER', 'SHOP_TENANT', 'COMMERCIAL_OCCUPANT']" required />
              </label>
              <label>
                <span>Occupancy status</span>
                <Select v-model="relationship.occupancyStatus" :options="['SELF_OCCUPIED', 'TENANTED', 'VACANT']" required />
              </label>
              <label>
                <span>Access scope</span>
                <Select v-model="relationship.accessScope" :options="['OWNERSHIP', 'TENANCY', 'HOUSEHOLD']" required />
              </label>
              <label>
                <span>Ownership %</span>
                <InputNumber v-model="relationship.ownershipPercent" :min="0" :max="100" fluid />
              </label>
              <label>
                <span>Security deposit</span>
                <InputNumber v-model="relationship.securityDepositAmount" :min="0" fluid />
              </label>
              <label>
                <span>Ownership label</span>
                <InputText v-model="relationship.ownershipLabel" />
              </label>
              <label>
                <span>Lease start</span>
                <InputText v-model="relationship.leaseStartDate" placeholder="YYYY-MM-DD" />
              </label>
              <label>
                <span>Lease end</span>
                <InputText v-model="relationship.leaseEndDate" placeholder="YYYY-MM-DD" />
              </label>
              <label class="admin-form-grid__full">
                <span>Relationship note</span>
                <Textarea v-model="relationship.relationshipNote" rows="2" auto-resize />
              </label>
            </div>

            <div class="admin-toggle-grid" style="margin-top: 1rem;">
              <label class="admin-toggle-card">
                <span>Primary contact</span>
                <ToggleSwitch v-model="relationship.isPrimaryContact" />
              </label>
              <label class="admin-toggle-card">
                <span>Billing contact</span>
                <ToggleSwitch v-model="relationship.isBillingContact" />
              </label>
              <label class="admin-toggle-card">
                <span>Relationship active</span>
                <ToggleSwitch v-model="relationship.isActive" />
              </label>
              <label class="admin-toggle-card">
                <span>Relationship can login</span>
                <ToggleSwitch v-model="relationship.canLogin" />
              </label>
            </div>

            <Button
              v-if="form.relationships.length > 1"
              type="button"
              label="Remove relationship"
              severity="danger"
              text
              style="margin-top: 1rem;"
              @click="removeRelationship(index)"
            />
          </article>
        </section>

        <section class="admin-form-subsection">
          <h3>Compliance and login control</h3>
          <div class="admin-form-grid">
            <label>
              <span>Government ID type</span>
              <InputText v-model="form.governmentIdType" />
            </label>
            <label>
              <span>Government ID number</span>
              <InputText v-model="form.governmentIdNumber" />
            </label>
            <label>
              <span>KYC status</span>
              <Select v-model="form.kycStatus" :options="['PENDING', 'VERIFIED', 'REJECTED', 'NOT_REQUIRED']" required />
            </label>
            <label>
              <span>Police verification</span>
              <Select v-model="form.policeVerificationStatus" :options="['PENDING', 'VERIFIED', 'REJECTED', 'NOT_REQUIRED']" required />
            </label>
            <label class="admin-form-grid__full">
              <span>Government ID document path</span>
              <InputText v-model="form.governmentIdDocumentPath" />
            </label>
            <label class="admin-form-grid__full">
              <span>Ownership proof path</span>
              <InputText v-model="form.ownershipProofPath" />
            </label>
            <label class="admin-form-grid__full">
              <span>Lease agreement path</span>
              <InputText v-model="form.leaseAgreementPath" />
            </label>
          </div>

          <div class="admin-toggle-grid" style="margin-top: 1rem;">
            <label class="admin-toggle-card">
              <span>User can login</span>
              <ToggleSwitch v-model="form.canLogin" />
            </label>
            <label class="admin-toggle-card">
              <span>User active</span>
              <ToggleSwitch v-model="form.isActive" />
            </label>
            <label class="admin-toggle-card">
              <span>Send onboarding invite</span>
              <ToggleSwitch v-model="form.sendInvite" />
            </label>
          </div>
        </section>

        <div class="admin-inline-actions" style="justify-content: flex-end; margin-top: 2rem; gap: 0.75rem;">
          <Button type="button" label="Cancel" severity="secondary" outlined @click="closeDialog" />
          <Button type="submit" :label="selectedResident ? 'Update resident' : 'Create resident'" :loading="saving" />
        </div>
      </form>
    </Dialog>
  </div>
</template>
