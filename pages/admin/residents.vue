<script setup lang="ts">
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

const columns = [
  { field: 'fullName', header: 'Resident', sortable: true },
  { field: 'role', header: 'Role', sortable: true },
  { field: 'email', header: 'Email', sortable: true },
  { field: 'canLogin', header: 'Login', sortable: true, kind: 'status' as const },
  { field: 'isActive', header: 'Active', sortable: true, kind: 'status' as const },
]

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
    resetForm()
    await refresh()
  } finally {
    saving.value = false
  }
}

const updateQuery = (value: ListQueryParams) => {
  query.value = value
}
</script>

<template>
  <div class="landing-page">
    <section class="hero-panel">
      <Tag severity="contrast" value="Residents" rounded />
      <h1>Residents and occupancy relationships</h1>
      <p>Manage owners, co-owners, tenants, family members, shop occupants, and multi-flat relationships from one master flow.</p>
    </section>

    <div class="admin-two-column admin-two-column--wide">
      <AppListPage
        title="Resident registry"
        description="Resident CRUD with server-driven search, role filters, and account-state visibility."
        :rows="data?.data.items ?? []"
        :columns="columns"
        :query="query"
        :total-records="data?.data.total ?? 0"
        :loading="pending"
        search-placeholder="Search residents by name, email, or mobile"
        @query="updateQuery"
      >
        <template #filters>
          <Select
            :model-value="query.filters.role?.[0] ?? ''"
            :options="['', 'RESIDENT', 'ADMIN', 'MANAGER', 'SERVICE_STAFF', 'GUARD']"
            placeholder="Role"
            @update:model-value="(value) => updateQuery({ ...query, filters: { ...query.filters, role: value ? [String(value)] : [] } })"
          />
        </template>
        <template #cell-fullName="{ row }">
          <div class="admin-inline-actions">
            <button class="table-link-button" type="button" @click="loadResident(row as ResidentSummary)">
              {{ (row as ResidentSummary).fullName }}
            </button>
            <NuxtLink :to="`/admin/residents/${(row as ResidentSummary).id}`" class="table-inline-link">
              View
            </NuxtLink>
          </div>
        </template>
      </AppListPage>

      <form class="surface-card admin-form-section" @submit.prevent="submit">
        <div class="admin-form-section__header">
          <div>
            <p class="eyebrow">Grouped Flow</p>
            <h2>{{ selectedResident ? 'Edit resident' : 'Create resident' }}</h2>
          </div>
          <div class="admin-inline-actions">
            <Button type="button" label="Reset" severity="secondary" outlined @click="resetForm" />
            <Button type="submit" :label="selectedResident ? 'Update resident' : 'Create resident'" :loading="saving" />
          </div>
        </div>

        <section class="admin-form-subsection">
          <h3>Account</h3>
          <div class="admin-form-grid">
            <label>
              <span>Full name</span>
              <InputText v-model="form.fullName" />
            </label>
            <label>
              <span>Email</span>
              <InputText v-model="form.email" type="email" />
            </label>
            <label>
              <span>Role</span>
              <Select v-model="form.role" :options="['RESIDENT', 'ADMIN', 'MANAGER', 'SERVICE_STAFF', 'GUARD']" />
            </label>
            <label>
              <span>Notification preset</span>
              <Select v-model="form.preferredNotificationChannels" :options="['ALL_CHANNELS', 'PUSH_EMAIL_WHATSAPP', 'PUSH_AND_EMAIL', 'PUSH', 'EMAIL', 'WHATSAPP']" />
            </label>
          </div>
        </section>

        <section class="admin-form-subsection">
          <h3>Identity and communication</h3>
          <div class="admin-form-grid">
            <label>
              <span>Mobile</span>
              <InputText v-model="form.mobileNumber" />
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
                <Select v-model="relationship.flatId" :options="flatOptions" option-label="label" option-value="value" />
              </label>
              <label>
                <span>Relationship type</span>
                <Select v-model="relationship.relationshipType" :options="['OWNER', 'CO_OWNER', 'TENANT', 'FAMILY_MEMBER', 'SHOP_OWNER', 'SHOP_TENANT', 'COMMERCIAL_OCCUPANT']" />
              </label>
              <label>
                <span>Occupancy status</span>
                <Select v-model="relationship.occupancyStatus" :options="['SELF_OCCUPIED', 'TENANTED', 'VACANT']" />
              </label>
              <label>
                <span>Access scope</span>
                <Select v-model="relationship.accessScope" :options="['OWNERSHIP', 'TENANCY', 'HOUSEHOLD']" />
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

            <div class="admin-toggle-grid">
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
              <Select v-model="form.kycStatus" :options="['PENDING', 'VERIFIED', 'REJECTED', 'NOT_REQUIRED']" />
            </label>
            <label>
              <span>Police verification</span>
              <Select v-model="form.policeVerificationStatus" :options="['PENDING', 'VERIFIED', 'REJECTED', 'NOT_REQUIRED']" />
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

          <div class="admin-toggle-grid">
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
      </form>
    </div>
  </div>
</template>
