<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { FlatSummary, ResidentDetail } from '~/types/domain'

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
  invite?: InviteDeliveryResponse
}

type InviteDeliveryResponse = {
  inviteUrl: string
  expiresAt: string
  emailDelivery?: {
    delivered: boolean
    reason?: string
  } | null
}

type ResidentFileUploadResponse = {
  field: ResidentFileField
  filePath: string
  fileUrl: string
  updatedAt: string
}

type ResidentRelationshipForm = {
  id: string | undefined
  flatId: string
  relationshipType: string
  isPrimaryContact: boolean
  isBillingContact: boolean
  canLogin: boolean
  isActive: boolean
  ownershipStartDate: string
  leaseStartDate: string
  leaseEndDate: string
  contractStartDate: string
  contractEndDate: string
  occupancyStatus: string
  accessScope: string
  relationshipNote: string
}

type ResidentForm = {
  role: string
  fullName: string
  email: string
  mobileNumber: string
  whatsappNumber: string
  isWhatsappSameAsMobile: boolean
  profileImagePath: string
  emergencyContactName: string
  emergencyContactNumber: string
  governmentIdType: string
  governmentIdNumber: string
  governmentIdDocumentPath: string
  ownershipProofPath: string
  leaseAgreementPath: string
  kycStatus: string
  policeVerificationStatus: string
  canLogin: boolean
  isActive: boolean
  sendInvite: boolean
  preferredNotificationChannels: string
  relationships: ResidentRelationshipForm[]
}

const props = withDefaults(
  defineProps<{
    visible: boolean
    residentId?: string | null
  }>(),
  {
    residentId: null,
  },
)

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: [payload: { residentId: string; created: boolean }]
}>()

const api = useApi()
const toast = useToast()
const { formatBytes } = useFinanceFormatters()

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
    allowedMimeTypes: [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
    ],
    maxSizeBytes: 10 * 1024 * 1024,
    icon: 'pi pi-id-card',
    invalidTypeDetail: 'Upload a PDF, PNG, JPG, JPEG, or WebP document.',
    invalidSizeDetail: 'Resident documents must be 10 MB or smaller.',
  },
  {
    field: 'ownershipProofPath',
    label: 'Ownership proof',
    accept: 'application/pdf,image/png,image/jpeg,image/webp',
    allowedMimeTypes: [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
    ],
    maxSizeBytes: 10 * 1024 * 1024,
    icon: 'pi pi-home',
    invalidTypeDetail: 'Upload a PDF, PNG, JPG, JPEG, or WebP document.',
    invalidSizeDetail: 'Resident documents must be 10 MB or smaller.',
  },
  {
    field: 'leaseAgreementPath',
    label: 'Lease agreement',
    accept: 'application/pdf,image/png,image/jpeg,image/webp',
    allowedMimeTypes: [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
    ],
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

const defaultRelationship = (
  overrides: Partial<ResidentRelationshipForm> = {},
): ResidentRelationshipForm => ({
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
  ...overrides,
})

const form = reactive<ResidentForm>({
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
  relationships: [defaultRelationship()],
})

const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => {
    if (value) {
      emit('update:visible', true)
      return
    }

    closeDialog()
  },
})
const loadedResidentId = ref('')
const loadingResident = ref(false)
const saving = ref(false)
const residentFileInputs = ref<
  Record<ResidentFileField, HTMLInputElement | null>
>({
  profileImagePath: null,
  governmentIdDocumentPath: null,
  ownershipProofPath: null,
  leaseAgreementPath: null,
})
const selectedResidentFiles = reactive<
  Record<ResidentFileField, LocalResidentFile | null>
>({
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
let loadToken = 0

const isEditing = computed(() => Boolean(props.residentId))

const { data: flatsData } = await useAsyncData(
  'resident-editor-flat-options',
  () =>
    api<{ ok: true; data: { items: FlatSummary[] } }>('/api/admin/flats', {
      query: {
        page: 1,
        pageSize: 500,
        sortBy: 'flatNumber',
        sortDirection: 'asc',
      },
    }),
)

const flatOptions = computed(() =>
  (flatsData.value?.data.items ?? []).map((item) => ({
    label: `${item.blockName} · ${item.flatNumber}`,
    value: item.id,
  })),
)

const clearResidentFileSelection = (field: ResidentFileField) => {
  const selectedFile = selectedResidentFiles[field]

  if (selectedFile?.previewUrl) {
    URL.revokeObjectURL(selectedFile.previewUrl)
  }

  selectedResidentFiles[field] = null
}

const clearAllResidentFileSelections = () => {
  residentFileConfigs.forEach((config) =>
    clearResidentFileSelection(config.field),
  )
}

const resetForm = () => {
  clearAllResidentFileSelections()
  loadedResidentId.value = ''
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
  form.relationships = [defaultRelationship()]
}

const addRelationship = () => {
  form.relationships.push(
    defaultRelationship({
      isPrimaryContact: false,
      isBillingContact: false,
      occupancyStatus: 'VACANT',
    }),
  )
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

const bumpResidentFilePreview = (field: ResidentFileField) => {
  residentFilePreviewVersion[field] = Date.now()
}

const getResidentFilePreviewUrl = (config: ResidentFileConfig) => {
  const selectedFile = selectedResidentFiles[config.field]

  if (selectedFile) {
    return selectedFile.previewUrl
  }

  if (loadedResidentId.value && getResidentFilePath(config.field)) {
    return `/api/admin/residents/${loadedResidentId.value}/files/${config.field}?v=${residentFilePreviewVersion[config.field]}`
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

const uploadResidentFile = async (
  residentId: string,
  config: ResidentFileConfig,
) => {
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

const applyResident = (item: ResidentDetail) => {
  loadedResidentId.value = item.id
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
  form.sendInvite = false
  form.preferredNotificationChannels = item.preferredNotificationChannels
  form.relationships = item.relationships.map(
    (relationship: ResidentDetail['relationships'][number]) => ({
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
    }),
  )
  residentFileConfigs.forEach((config) => bumpResidentFilePreview(config.field))
}

const loadResident = async (residentId: string) => {
  const token = ++loadToken
  loadingResident.value = true
  resetForm()

  try {
    const response = await api<{ ok: true; data: ResidentDetail }>(
      `/api/admin/residents/${residentId}`,
    )

    if (
      token !== loadToken ||
      !props.visible ||
      props.residentId !== residentId
    ) {
      return
    }

    applyResident(response.data)
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Unable to load resident',
      detail: 'Try opening the editor again.',
      life: 6000,
    })
    closeDialog()
  } finally {
    if (token === loadToken) {
      loadingResident.value = false
    }
  }
}

const closeDialog = () => {
  loadToken += 1
  emit('update:visible', false)
  resetForm()
  loadingResident.value = false
}

watch(
  () => [props.visible, props.residentId] as const,
  ([visible, residentId]) => {
    if (!visible) {
      loadToken += 1
      resetForm()
      loadingResident.value = false
      return
    }

    if (residentId) {
      void loadResident(residentId)
      return
    }

    loadToken += 1
    resetForm()
  },
  { immediate: true },
)

const submit = async () => {
  saving.value = true

  try {
    const payload = {
      ...form,
      whatsappNumber: form.isWhatsappSameAsMobile
        ? null
        : form.whatsappNumber || null,
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

    let savedResidentId = loadedResidentId.value || props.residentId || ''
    let createdResident = false
    let inviteDeliveryWarning = ''

    if (savedResidentId) {
      await api(`/api/admin/residents/${savedResidentId}`, {
        method: 'PATCH',
        body: payload,
      })
    } else {
      const response = await api<{ ok: true; data: ResidentSaveResponse }>(
        '/api/admin/residents',
        {
          method: 'POST',
          body: payload,
        },
      )
      savedResidentId = response.data.id
      createdResident = true

      const inviteDelivery = response.data.invite?.emailDelivery
      if (inviteDelivery && !inviteDelivery.delivered) {
        inviteDeliveryWarning =
          inviteDelivery.reason ??
          'Invite was created, but email delivery failed.'
      }
    }

    try {
      if (savedResidentId) {
        await uploadPendingResidentFiles(savedResidentId)
      }
    } catch (error) {
      if (createdResident) {
        toast.add({
          severity: 'warn',
          summary: 'Resident created',
          detail: 'Some files were not uploaded. Edit the resident to retry.',
          life: 10000,
        })
        emit('saved', { residentId: savedResidentId, created: createdResident })
        closeDialog()
        return
      }

      throw error
    }

    toast.add({
      severity: inviteDeliveryWarning ? 'warn' : 'success',
      summary: inviteDeliveryWarning ? 'Resident created' : 'Saved',
      detail:
        inviteDeliveryWarning ||
        (createdResident ? 'Resident created.' : 'Resident updated.'),
      life: 10000,
    })
    emit('saved', { residentId: savedResidentId, created: createdResident })
    closeDialog()
  } finally {
    saving.value = false
  }
}

onBeforeUnmount(clearAllResidentFileSelections)
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    :header="isEditing ? 'Edit Resident' : 'Create Resident'"
    modal
    class="p-dialog-custom"
    :style="{ width: '900px', maxWidth: '95vw' }"
    :pt="{
      root: { style: { borderRadius: 'var(--radius-lg)', overflow: 'hidden' } },
    }"
  >
    <AppState
      v-if="loadingResident"
      variant="loading"
      title="Loading resident"
      message="Preparing resident details."
    />

    <form
      v-else
      class="admin-form-layout"
      style="padding: 1.5rem 0.5rem 0; max-height: 75vh; overflow-y: auto"
      @submit.prevent="submit"
    >
      <section class="admin-form-subsection">
        <h3>Account</h3>
        <div class="admin-form-grid">
          <label>
            <span>Full name</span>
            <InputText v-model="form.fullName" required />
          </label>
          <label>
            <span>Email</span>
            <InputText
              v-model="form.email"
              type="email"
              :required="!isEditing || form.canLogin"
            />
          </label>
          <label>
            <span>Notification preset</span>
            <Select
              v-model="form.preferredNotificationChannels"
              :options="[
                'ALL_CHANNELS',
                'PUSH_EMAIL_WHATSAPP',
                'PUSH_AND_EMAIL',
                'PUSH',
                'EMAIL',
                'WHATSAPP',
              ]"
              required
            />
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
            <InputText
              v-model="form.whatsappNumber"
              :disabled="form.isWhatsappSameAsMobile"
            />
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
                v-if="
                  isResidentFileImage(config) &&
                  getResidentFilePreviewUrl(config)
                "
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
                    :label="
                      hasResidentFile(config.field) ? 'Replace' : 'Upload'
                    "
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
              <strong v-if="getResidentFileName(config.field)">{{
                getResidentFileName(config.field)
              }}</strong>
              <span class="muted-line">{{
                getResidentFileMeta(config.field) || 'PNG, JPG, JPEG, or WebP'
              }}</span>
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
          <Button
            type="button"
            label="Add relationship"
            severity="secondary"
            outlined
            @click="addRelationship"
          />
        </div>

        <article
          v-for="(relationship, index) in form.relationships"
          :key="relationship.id ?? index"
          class="admin-relationship-card"
        >
          <div class="admin-form-grid">
            <label>
              <span>Flat</span>
              <Select
                v-model="relationship.flatId"
                :options="flatOptions"
                option-label="label"
                option-value="value"
                required
              />
            </label>
            <label>
              <span>Relationship type</span>
              <Select
                v-model="relationship.relationshipType"
                :options="['OWNER', 'TENANT', 'FAMILY_MEMBER']"
                required
              />
            </label>
            <label>
              <span>Occupancy status</span>
              <Select
                v-model="relationship.occupancyStatus"
                :options="['SELF_OCCUPIED', 'TENANTED', 'VACANT']"
                required
              />
            </label>
            <label>
              <span>Access scope</span>
              <Select
                v-model="relationship.accessScope"
                :options="['OWNERSHIP', 'TENANCY', 'HOUSEHOLD']"
                required
              />
            </label>
            <label>
              <span>Lease start</span>
              <InputText
                v-model="relationship.leaseStartDate"
                placeholder="YYYY-MM-DD"
              />
            </label>
            <label>
              <span>Lease end</span>
              <InputText
                v-model="relationship.leaseEndDate"
                placeholder="YYYY-MM-DD"
              />
            </label>
            <label class="admin-form-grid__full">
              <span>Relationship note</span>
              <Textarea
                v-model="relationship.relationshipNote"
                rows="2"
                auto-resize
              />
            </label>
          </div>

          <div class="admin-toggle-grid" style="margin-top: 1rem">
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
            style="margin-top: 1rem"
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
            <Select
              v-model="form.kycStatus"
              :options="['PENDING', 'VERIFIED', 'REJECTED', 'NOT_REQUIRED']"
              required
            />
          </label>
          <label>
            <span>Police verification</span>
            <Select
              v-model="form.policeVerificationStatus"
              :options="['PENDING', 'VERIFIED', 'REJECTED', 'NOT_REQUIRED']"
              required
            />
          </label>
          <div class="admin-form-grid__full resident-file-list">
            <div
              v-for="config in residentDocumentFileConfigs"
              :key="config.field"
              class="resident-file-upload resident-file-upload--document"
            >
              <div class="resident-file-upload__preview">
                <img
                  v-if="
                    isResidentFileImage(config) &&
                    getResidentFilePreviewUrl(config)
                  "
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
                      :label="
                        hasResidentFile(config.field) ? 'Replace' : 'Upload'
                      "
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
                <strong v-if="getResidentFileName(config.field)">{{
                  getResidentFileName(config.field)
                }}</strong>
                <span class="muted-line">{{
                  getResidentFileMeta(config.field) ||
                  'PDF, PNG, JPG, JPEG, or WebP'
                }}</span>
                <input
                  :ref="
                    (element) => setResidentFileInput(config.field, element)
                  "
                  type="file"
                  :accept="config.accept"
                  class="resident-file-upload__input"
                  @change="onResidentFileChange(config, $event)"
                >
              </div>
            </div>
          </div>
        </div>

        <div class="admin-toggle-grid" style="margin-top: 1rem">
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
          :label="isEditing ? 'Update resident' : 'Create resident'"
          :loading="saving"
        />
      </div>
    </form>
  </Dialog>
</template>
