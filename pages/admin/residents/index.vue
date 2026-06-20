<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
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
const { formatBytes } = useFinanceFormatters()

type ResidentFileField =
  | 'profileImagePath'
  | 'governmentIdDocumentPath'
  | 'ownershipProofPath'
  | 'leaseAgreementPath'

type ResidentFileConfig = {
  field: ResidentFileField
  label: string
  accept: string
  allowedMimeTypes: readonly string[]
  maxSizeBytes: number
  icon: string
  invalidTypeDetail: string
  invalidSizeDetail: string
}

type LocalResidentFile = {
  file: File
  previewUrl: string
  fileName: string
  mimeType: string
  sizeBytes: number
}

type ResidentSaveResponse = {
  id: string
  authUserId?: string
  updated?: boolean
}

type ResidentFileUploadResponse = {
  field: ResidentFileField
  filePath: string
  fileUrl: string
  updatedAt: string
}

const residentProfileFileConfig: ResidentFileConfig = {
  field: 'profileImagePath',
  label: 'Profile photo',
  accept: 'image/png,image/jpeg,image/webp',
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  maxSizeBytes: 2 * 1024 * 1024,
  icon: 'pi pi-user',
  invalidTypeDetail: 'Upload a PNG, JPG, JPEG, or WebP profile photo.',
  invalidSizeDetail: 'Profile photos must be 2 MB or smaller.',
}

const residentDocumentFileConfigs: ResidentFileConfig[] = [
  {
    field: 'governmentIdDocumentPath',
    label: 'Government ID document',
    accept: 'application/pdf,image/png,image/jpeg,image/webp',
    allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
    maxSizeBytes: 10 * 1024 * 1024,
    icon: 'pi pi-id-card',
    invalidTypeDetail: 'Upload a PDF, PNG, JPG, JPEG, or WebP document.',
    invalidSizeDetail: 'Resident documents must be 10 MB or smaller.',
  },
  {
    field: 'ownershipProofPath',
    label: 'Ownership proof',
    accept: 'application/pdf,image/png,image/jpeg,image/webp',
    allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
    maxSizeBytes: 10 * 1024 * 1024,
    icon: 'pi pi-home',
    invalidTypeDetail: 'Upload a PDF, PNG, JPG, JPEG, or WebP document.',
    invalidSizeDetail: 'Resident documents must be 10 MB or smaller.',
  },
  {
    field: 'leaseAgreementPath',
    label: 'Lease agreement',
    accept: 'application/pdf,image/png,image/jpeg,image/webp',
    allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
    maxSizeBytes: 10 * 1024 * 1024,
    icon: 'pi pi-file-pdf',
    invalidTypeDetail: 'Upload a PDF, PNG, JPG, JPEG, or WebP document.',
    invalidSizeDetail: 'Resident documents must be 10 MB or smaller.',
  },
]

const residentProfileFileConfigs = [residentProfileFileConfig]
const residentFileConfigs = [
  residentProfileFileConfig,
  ...residentDocumentFileConfigs,
]

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
const residentFileInputs = ref<Record<ResidentFileField, HTMLInputElement | null>>({
  profileImagePath: null,
  governmentIdDocumentPath: null,
  ownershipProofPath: null,
  leaseAgreementPath: null,
})
const selectedResidentFiles = reactive<Record<ResidentFileField, LocalResidentFile | null>>({
  profileImagePath: null,
  governmentIdDocumentPath: null,
  ownershipProofPath: null,
  leaseAgreementPath: null,
})
const residentFilePreviewVersion = reactive<Record<ResidentFileField, number>>({
  profileImagePath: 0,
  governmentIdDocumentPath: 0,
  ownershipProofPath: 0,
  leaseAgreementPath: 0,
})
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
      ownershipStartDate: '',
      leaseStartDate: '',
      leaseEndDate: '',
      contractStartDate: '',
      contractEndDate: '',
      occupancyStatus: 'SELF_OCCUPIED',
      accessScope: 'OWNERSHIP',
      relationshipNote: '',
    },
  ],
})

const { data: flatsData } = await useAsyncData('admin-flat-options', () =>
  api<{ ok: true; data: { items: FlatSummary[] } }>('/api/admin/flats', {
    query: { page: 1, pageSize: 500, sortBy: 'flatNumber', sortDirection: 'asc' },
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
      canLogin: query.value.filters.canLogin?.[0],
      isActive: query.value.filters.isActive?.[0],
      flatId: query.value.filters.flatId?.[0],
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
    ownershipStartDate: '',
    leaseStartDate: '',
    leaseEndDate: '',
    contractStartDate: '',
    contractEndDate: '',
    occupancyStatus: 'VACANT',
    accessScope: 'OWNERSHIP',
    relationshipNote: '',
  })
}

const removeRelationship = (index: number) => {
  form.relationships.splice(index, 1)
}

const setResidentFileInput = (
  field: ResidentFileField,
  element: Element | ComponentPublicInstance | null,
) => {
  if (element instanceof HTMLInputElement) {
    residentFileInputs.value[field] = element
  } else {
    residentFileInputs.value[field] = null
  }
}

const getResidentFilePath = (field: ResidentFileField) => form[field]

const setResidentFilePath = (field: ResidentFileField, value: string) => {
  form[field] = value
}

const clearResidentFileSelection = (field: ResidentFileField) => {
  const selectedFile = selectedResidentFiles[field]

  if (selectedFile?.previewUrl) {
    URL.revokeObjectURL(selectedFile.previewUrl)
  }

  selectedResidentFiles[field] = null
}

const clearAllResidentFileSelections = () => {
  residentFileConfigs.forEach((config) => clearResidentFileSelection(config.field))
}

const bumpResidentFilePreview = (field: ResidentFileField) => {
  residentFilePreviewVersion[field] = Date.now()
}

const getResidentFilePreviewUrl = (config: ResidentFileConfig) => {
  const selectedFile = selectedResidentFiles[config.field]

  if (selectedFile) {
    return selectedFile.previewUrl
  }

  if (selectedResident.value && getResidentFilePath(config.field)) {
    return `/api/admin/residents/${selectedResident.value.id}/files/${config.field}?v=${residentFilePreviewVersion[config.field]}`
  }

  return ''
}

const getResidentFileName = (field: ResidentFileField) => {
  const selectedFile = selectedResidentFiles[field]

  if (selectedFile) {
    return selectedFile.fileName
  }

  return getResidentFilePath(field).split('/').pop() ?? ''
}

const getResidentFileMeta = (field: ResidentFileField) => {
  const selectedFile = selectedResidentFiles[field]

  if (!selectedFile) {
    return ''
  }

  return `${selectedFile.mimeType} · ${formatBytes(selectedFile.sizeBytes)}`
}

const hasResidentFile = (field: ResidentFileField) =>
  Boolean(selectedResidentFiles[field] || getResidentFilePath(field))

const isResidentFileImage = (config: ResidentFileConfig) => {
  const selectedFile = selectedResidentFiles[config.field]

  if (selectedFile) {
    return selectedFile.mimeType.startsWith('image/')
  }

  return config.field === 'profileImagePath'
}

const pickResidentFile = (field: ResidentFileField) => {
  residentFileInputs.value[field]?.click()
}

const clearResidentFile = (field: ResidentFileField) => {
  clearResidentFileSelection(field)
  setResidentFilePath(field, '')
  bumpResidentFilePreview(field)
}

const onResidentFileChange = (config: ResidentFileConfig, event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''

  if (!file) {
    return
  }

  if (!config.allowedMimeTypes.includes(file.type)) {
    toast.add({
      severity: 'warn',
      summary: 'Unsupported file',
      detail: config.invalidTypeDetail,
      life: 10000,
    })
    return
  }

  if (file.size <= 0 || file.size > config.maxSizeBytes) {
    toast.add({
      severity: 'warn',
      summary: 'File too large',
      detail: config.invalidSizeDetail,
      life: 10000,
    })
    return
  }

  clearResidentFileSelection(config.field)
  selectedResidentFiles[config.field] = {
    file,
    previewUrl: URL.createObjectURL(file),
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  }
}

const uploadResidentFile = async (residentId: string, config: ResidentFileConfig) => {
  const selectedFile = selectedResidentFiles[config.field]

  if (!selectedFile) {
    return null
  }

  const formData = new FormData()
  formData.append('field', config.field)
  formData.append('file', selectedFile.file)

  const response = await api<{ ok: true; data: ResidentFileUploadResponse }>(
    `/api/admin/residents/${residentId}/files`,
    {
      method: 'POST',
      body: formData,
    },
  )

  setResidentFilePath(config.field, response.data.filePath)
  bumpResidentFilePreview(config.field)
  clearResidentFileSelection(config.field)

  return response.data
}

const uploadPendingResidentFiles = async (residentId: string) => {
  const uploadedFiles: ResidentFileUploadResponse[] = []

  for (const config of residentFileConfigs) {
    const uploadedFile = await uploadResidentFile(residentId, config)

    if (uploadedFile) {
      uploadedFiles.push(uploadedFile)
    }
  }

  return uploadedFiles
}

const resetForm = () => {
  clearAllResidentFileSelections()
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
      ownershipStartDate: '',
      leaseStartDate: '',
      leaseEndDate: '',
      contractStartDate: '',
      contractEndDate: '',
      occupancyStatus: 'SELF_OCCUPIED',
      accessScope: 'OWNERSHIP',
      relationshipNote: '',
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
  clearAllResidentFileSelections()
  const response = await api<{ ok: true; data: ResidentDetail }>(`/api/admin/residents/${resident.id}`)
  const item = response.data
  selectedResident.value = resident
  form.role = item.role
  form.fullName = item.fullName
  form.email = item.email ?? ''
  form.mobileNumber = item.mobileNumber ?? ''
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
    ownershipStartDate: relationship.ownershipStartDate ?? '',
    leaseStartDate: relationship.leaseStartDate ?? '',
    leaseEndDate: relationship.leaseEndDate ?? '',
    contractStartDate: relationship.contractStartDate ?? '',
    contractEndDate: relationship.contractEndDate ?? '',
    occupancyStatus: relationship.occupancyStatus ?? 'VACANT',
    accessScope: relationship.accessScope ?? 'OWNERSHIP',
    relationshipNote: relationship.relationshipNote ?? '',
  }))
  residentFileConfigs.forEach((config) => bumpResidentFilePreview(config.field))
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
        ownershipStartDate: relationship.ownershipStartDate || null,
        leaseStartDate: relationship.leaseStartDate || null,
        leaseEndDate: relationship.leaseEndDate || null,
        contractStartDate: relationship.contractStartDate || null,
        contractEndDate: relationship.contractEndDate || null,
        relationshipNote: relationship.relationshipNote || null,
      })),
    }

    let residentId = selectedResident.value?.id ?? ''
    let createdResident = false

    if (selectedResident.value) {
      await api(`/api/admin/residents/${selectedResident.value.id}`, {
        method: 'PATCH',
        body: payload,
      })
    } else {
      const response = await api<{ ok: true; data: ResidentSaveResponse }>('/api/admin/residents', {
        method: 'POST',
        body: payload,
      })
      residentId = response.data.id
      createdResident = true
    }

    try {
      if (residentId) {
        await uploadPendingResidentFiles(residentId)
      }
    } catch (error) {
      if (createdResident) {
        toast.add({
          severity: 'warn',
          summary: 'Resident created',
          detail: 'Some files were not uploaded. Edit the resident to retry.',
          life: 10000,
        })
        closeDialog()
        await refresh()
        return
      }

      throw error
    }

    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: selectedResident.value ? 'Resident updated.' : 'Resident created.',
      life: 10000,
    })
    closeDialog()
    await refresh()
  } finally {
    saving.value = false
  }
}

onBeforeUnmount(clearAllResidentFileSelections)

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
            <p>Resident CRUD with server-driven search and account-state visibility.</p>
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
              v-model="flatFilter"
              :options="[{ label: 'All flats', value: '' }, ...flatOptions]"
              option-label="label"
              option-value="value"
              placeholder="Flat"
              filter
              show-clear
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
                <span v-for="flatNumber in row.flatNumbers" :key="flatNumber">{{ flatNumber }}</span>
                <span v-if="!row.flatNumbers?.length">-</span>
              </div>
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
        </AppDataTable>
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
            <div
              v-for="config in residentProfileFileConfigs"
              :key="config.field"
              class="admin-form-grid__full resident-file-upload"
            >
              <div class="resident-file-upload__preview">
                <img
                  v-if="isResidentFileImage(config) && getResidentFilePreviewUrl(config)"
                  :src="getResidentFilePreviewUrl(config)"
                  :alt="`${form.fullName || 'Resident'} ${config.label}`"
                >
                <i v-else :class="config.icon" aria-hidden="true" />
              </div>
              <div class="resident-file-upload__body">
                <div class="resident-file-upload__header">
                  <span class="field-label">{{ config.label }}</span>
                  <div class="admin-inline-actions">
                    <Button
                      type="button"
                      icon="pi pi-upload"
                      :label="hasResidentFile(config.field) ? 'Replace' : 'Upload'"
                      severity="secondary"
                      outlined
                      @click="pickResidentFile(config.field)"
                    />
                    <Button
                      v-if="getResidentFilePreviewUrl(config)"
                      as="a"
                      :href="getResidentFilePreviewUrl(config)"
                      target="_blank"
                      rel="noopener"
                      icon="pi pi-search-plus"
                      label="Open"
                      severity="secondary"
                      outlined
                    />
                    <Button
                      v-if="hasResidentFile(config.field)"
                      type="button"
                      icon="pi pi-times"
                      label="Remove"
                      severity="danger"
                      outlined
                      @click="clearResidentFile(config.field)"
                    />
                  </div>
                </div>
                <strong v-if="getResidentFileName(config.field)">{{ getResidentFileName(config.field) }}</strong>
                <span class="muted-line">{{ getResidentFileMeta(config.field) || 'PNG, JPG, JPEG, or WebP' }}</span>
                <input
                  :ref="(element) => setResidentFileInput(config.field, element)"
                  type="file"
                  :accept="config.accept"
                  class="resident-file-upload__input"
                  @change="onResidentFileChange(config, $event)"
                >
              </div>
            </div>
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
                <Select v-model="relationship.relationshipType" :options="['OWNER', 'TENANT', 'FAMILY_MEMBER']" required />
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
            <div class="admin-form-grid__full resident-file-list">
              <div
                v-for="config in residentDocumentFileConfigs"
                :key="config.field"
                class="resident-file-upload resident-file-upload--document"
              >
                <div class="resident-file-upload__preview">
                  <img
                    v-if="isResidentFileImage(config) && getResidentFilePreviewUrl(config)"
                    :src="getResidentFilePreviewUrl(config)"
                    :alt="`${form.fullName || 'Resident'} ${config.label}`"
                  >
                  <i v-else :class="config.icon" aria-hidden="true" />
                </div>
                <div class="resident-file-upload__body">
                  <div class="resident-file-upload__header">
                    <span class="field-label">{{ config.label }}</span>
                    <div class="admin-inline-actions">
                      <Button
                        type="button"
                        icon="pi pi-upload"
                        :label="hasResidentFile(config.field) ? 'Replace' : 'Upload'"
                        severity="secondary"
                        outlined
                        @click="pickResidentFile(config.field)"
                      />
                      <Button
                        v-if="getResidentFilePreviewUrl(config)"
                        as="a"
                        :href="getResidentFilePreviewUrl(config)"
                        target="_blank"
                        rel="noopener"
                        icon="pi pi-search-plus"
                        label="Open"
                        severity="secondary"
                        outlined
                      />
                      <Button
                        v-if="hasResidentFile(config.field)"
                        type="button"
                        icon="pi pi-times"
                        label="Remove"
                        severity="danger"
                        outlined
                        @click="clearResidentFile(config.field)"
                      />
                    </div>
                  </div>
                  <strong v-if="getResidentFileName(config.field)">{{ getResidentFileName(config.field) }}</strong>
                  <span class="muted-line">{{ getResidentFileMeta(config.field) || 'PDF, PNG, JPG, JPEG, or WebP' }}</span>
                  <input
                    :ref="(element) => setResidentFileInput(config.field, element)"
                    type="file"
                    :accept="config.accept"
                    class="resident-file-upload__input"
                    @change="onResidentFileChange(config, $event)"
                  >
                </div>
              </div>
            </div>
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
