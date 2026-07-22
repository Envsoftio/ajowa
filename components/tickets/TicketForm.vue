<script setup lang="ts">
import type {
  ServiceDepartment,
  ServiceLocationType,
  ServicePriority,
} from '~/types/domain'
import {
  priorityLabels,
  serviceCategories,
  servicePriorities,
} from '~/shared/service-requests'
import {
  serviceRequestCreateSchema,
  serviceRequestFieldLimits,
} from '~/shared/service-request-validation'
import type { ServiceRequestCreateSource } from '~/shared/service-request-validation'
import type { ServiceRequestCreatePayload } from '~/composables/useServiceRequests'

type TicketFormField =
  | 'category'
  | 'priority'
  | 'title'
  | 'description'
  | 'sourceType'
  | 'locationType'
  | 'flatId'
  | 'areaName'
  | 'assetReference'
  | 'preferredVisitTime'
  | 'emergencyConfirmed'
  | 'departmentId'
  | 'assigneeUserId'

const props = withDefaults(
  defineProps<{
    flatOptions: Array<{ id: string; label: string }>
    departments?: ServiceDepartment[]
    staffOptions?: Array<{ id: string; fullName: string; email: string }>
    adminMode?: boolean
    saving?: boolean
  }>(),
  {
    departments: () => [],
    staffOptions: () => [],
    adminMode: false,
    saving: false,
  },
)

const emit = defineEmits<{
  submit: [payload: ServiceRequestCreatePayload]
}>()

const validationAttempted = ref(false)

const form = reactive({
  category: 'ELECTRICAL',
  title: '',
  description: '',
  priority: 'MEDIUM' as ServicePriority,
  locationType: 'FLAT' as ServiceLocationType,
  flatId: props.flatOptions[0]?.id ?? null,
  areaName: null as string | null,
  assetReference: null as string | null,
  departmentId: null as string | null,
  assigneeUserId: null as string | null,
  sourceType: 'RESIDENT_REQUEST' as ServiceRequestCreateSource,
  preferredVisitTime: '',
  emergencyConfirmed: false,
})

watch(
  () => props.flatOptions,
  (flats) => {
    if (form.flatId && flats.some((flat) => flat.id === form.flatId)) {
      return
    }

    form.flatId = flats[0]?.id ?? null
  },
  { immediate: true },
)

const priorityOptions = servicePriorities.map((priority) => ({
  label: priorityLabels[priority],
  value: priority,
}))

const selectedDepartment = computed(
  () =>
    props.departments.find(
      (department) => department.id === form.departmentId,
    ) ?? null,
)

const filteredStaffOptions = computed(() => {
  if (!selectedDepartment.value) {
    return []
  }

  const activeStaffIds = new Set(
    selectedDepartment.value.staffAssignments
      ?.filter((assignment) => assignment.isActive)
      .map((assignment) => assignment.userId) ?? [],
  )

  return props.staffOptions.filter((staff) => activeStaffIds.has(staff.id))
})

const assigneePlaceholder = computed(() => {
  if (!form.departmentId) {
    return 'Choose a department first'
  }

  return filteredStaffOptions.value.length > 0
    ? 'Select staff'
    : 'No active staff mapped'
})

watch(filteredStaffOptions, (staff) => {
  if (
    form.assigneeUserId &&
    !staff.some((item) => item.id === form.assigneeUserId)
  ) {
    form.assigneeUserId = null
  }
})

const normalizeOptionalText = (value: string | null) => value?.trim() || null

const buildPayload = (): ServiceRequestCreatePayload => ({
  category: form.category,
  title: form.title,
  description: form.description,
  priority: form.priority,
  locationType: form.locationType,
  flatId: form.locationType === 'FLAT' ? form.flatId : null,
  areaName:
    form.locationType === 'COMMON_AREA'
      ? normalizeOptionalText(form.areaName)
      : null,
  assetReference:
    form.locationType === 'SOCIETY_ASSET'
      ? normalizeOptionalText(form.assetReference)
      : null,
  departmentId: props.adminMode ? form.departmentId : null,
  assigneeUserId: props.adminMode ? form.assigneeUserId : null,
  sourceType: props.adminMode ? form.sourceType : 'RESIDENT_REQUEST',
  preferredVisitTime: normalizeOptionalText(form.preferredVisitTime),
  emergencyConfirmed: form.emergencyConfirmed,
})

const validationState = computed(() => {
  const parsed = serviceRequestCreateSchema.safeParse(buildPayload())
  const errors: Partial<Record<TicketFormField, string>> = {}

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (typeof field === 'string' && !(field in errors)) {
        errors[field as TicketFormField] = issue.message
      }
    }
  }

  if (
    form.locationType === 'FLAT' &&
    form.flatId &&
    !props.flatOptions.some((flat) => flat.id === form.flatId)
  ) {
    errors.flatId = 'Choose a flat linked to your account.'
  }

  if (
    props.adminMode &&
    form.departmentId &&
    !props.departments.some((department) => department.id === form.departmentId)
  ) {
    errors.departmentId = 'Choose an active service department.'
  }

  if (
    props.adminMode &&
    form.assigneeUserId &&
    !filteredStaffOptions.value.some(
      (staff) => staff.id === form.assigneeUserId,
    )
  ) {
    errors.assigneeUserId = 'Choose active staff from the selected department.'
  }

  return { parsed, errors }
})

const fieldError = (field: TicketFormField) =>
  validationAttempted.value ? validationState.value.errors[field] : undefined

const firstFormError = computed(() => {
  if (!validationAttempted.value) {
    return null
  }

  return Object.values(validationState.value.errors).find(Boolean) ?? null
})

const submitForm = () => {
  if (props.saving) {
    return
  }

  validationAttempted.value = true
  const { parsed, errors } = validationState.value

  if (!parsed.success || Object.keys(errors).length > 0) {
    return
  }

  emit('submit', {
    category: parsed.data.category,
    title: parsed.data.title,
    description: parsed.data.description,
    priority: parsed.data.priority,
    locationType: parsed.data.locationType,
    flatId: parsed.data.flatId ?? null,
    areaName: parsed.data.areaName ?? null,
    assetReference: parsed.data.assetReference ?? null,
    departmentId: parsed.data.departmentId ?? null,
    assigneeUserId: parsed.data.assigneeUserId ?? null,
    sourceType: parsed.data.sourceType,
    preferredVisitTime: parsed.data.preferredVisitTime ?? null,
    emergencyConfirmed: parsed.data.emergencyConfirmed,
  })
}
</script>

<template>
  <form class="ticket-form" novalidate @submit.prevent="submitForm">
    <Message v-if="firstFormError" severity="error" role="alert">
      Please correct the highlighted field: {{ firstFormError }}
    </Message>

    <section class="admin-form-subsection">
      <h3>Problem</h3>
      <div class="admin-form-grid">
        <label>
          <span
            >Category
            <span class="required-marker" aria-hidden="true">*</span></span
          >
          <Select
            v-model="form.category"
            :options="[...serviceCategories]"
            option-label="label"
            option-value="value"
            :invalid="Boolean(fieldError('category'))"
            fluid
          />
          <small v-if="fieldError('category')" class="field-error">{{
            fieldError('category')
          }}</small>
        </label>
        <label>
          <span
            >Priority
            <span class="required-marker" aria-hidden="true">*</span></span
          >
          <Select
            v-model="form.priority"
            :options="priorityOptions"
            option-label="label"
            option-value="value"
            :invalid="Boolean(fieldError('priority'))"
            fluid
          />
          <small v-if="fieldError('priority')" class="field-error">{{
            fieldError('priority')
          }}</small>
        </label>
        <label class="admin-form-grid__full">
          <span
            >Title
            <span class="required-marker" aria-hidden="true">*</span></span
          >
          <InputText
            v-model="form.title"
            minlength="3"
            :maxlength="serviceRequestFieldLimits.title"
            :invalid="Boolean(fieldError('title'))"
            fluid
          />
          <small v-if="fieldError('title')" class="field-error">{{
            fieldError('title')
          }}</small>
        </label>
        <label class="admin-form-grid__full">
          <span
            >Description
            <span class="required-marker" aria-hidden="true">*</span></span
          >
          <Textarea
            v-model="form.description"
            minlength="10"
            :maxlength="serviceRequestFieldLimits.description"
            rows="5"
            :invalid="Boolean(fieldError('description'))"
            auto-resize
            fluid
          />
          <small v-if="fieldError('description')" class="field-error">{{
            fieldError('description')
          }}</small>
        </label>
      </div>
      <Message v-if="form.priority === 'EMERGENCY'" severity="warn">
        Emergency requests notify the operations team immediately. Confirm this
        is urgent before submitting.
      </Message>
      <label v-if="form.priority === 'EMERGENCY'" class="admin-toggle-card">
        <span
          >Confirm emergency priority
          <span class="required-marker" aria-hidden="true">*</span></span
        >
        <ToggleSwitch
          v-model="form.emergencyConfirmed"
          :invalid="Boolean(fieldError('emergencyConfirmed'))"
        />
      </label>
      <small v-if="fieldError('emergencyConfirmed')" class="field-error">
        {{ fieldError('emergencyConfirmed') }}
      </small>
    </section>

    <section class="admin-form-subsection">
      <h3>Location</h3>
      <TicketLocationSelector
        v-model:location-type="form.locationType"
        v-model:flat-id="form.flatId"
        v-model:area-name="form.areaName"
        v-model:asset-reference="form.assetReference"
        :flat-options="flatOptions"
        :location-type-error="fieldError('locationType')"
        :flat-error="fieldError('flatId')"
        :area-name-error="fieldError('areaName')"
        :asset-reference-error="fieldError('assetReference')"
      />
      <label>
        <span>Preferred visit time</span>
        <InputText
          v-model="form.preferredVisitTime"
          :maxlength="serviceRequestFieldLimits.preferredVisitTime"
          placeholder="Today after 3 PM, tomorrow morning"
          :invalid="Boolean(fieldError('preferredVisitTime'))"
          fluid
        />
        <small v-if="fieldError('preferredVisitTime')" class="field-error">
          {{ fieldError('preferredVisitTime') }}
        </small>
      </label>
    </section>

    <section v-if="adminMode" class="admin-form-subsection">
      <h3>Routing</h3>
      <div class="admin-form-grid">
        <label>
          <span
            >Source
            <span class="required-marker" aria-hidden="true">*</span></span
          >
          <Select
            v-model="form.sourceType"
            :options="[
              'ADMIN_CREATED',
              'COMMON_AREA_REPORT',
              'STAFF_REPORTED',
              'RESIDENT_REQUEST',
            ]"
            :invalid="Boolean(fieldError('sourceType'))"
            fluid
          />
          <small v-if="fieldError('sourceType')" class="field-error">{{
            fieldError('sourceType')
          }}</small>
        </label>
        <label>
          <span>Department</span>
          <Select
            v-model="form.departmentId"
            :options="departments"
            option-label="name"
            option-value="id"
            :invalid="Boolean(fieldError('departmentId'))"
            show-clear
            fluid
          />
          <small v-if="fieldError('departmentId')" class="field-error">{{
            fieldError('departmentId')
          }}</small>
        </label>
        <label class="admin-form-grid__full">
          <span>Assignee</span>
          <Select
            v-model="form.assigneeUserId"
            :options="filteredStaffOptions"
            option-label="fullName"
            option-value="id"
            :placeholder="assigneePlaceholder"
            :disabled="!form.departmentId || filteredStaffOptions.length === 0"
            :invalid="Boolean(fieldError('assigneeUserId'))"
            show-clear
            fluid
          />
          <small v-if="fieldError('assigneeUserId')" class="field-error">{{
            fieldError('assigneeUserId')
          }}</small>
        </label>
      </div>
    </section>

    <div class="admin-inline-actions" style="justify-content: flex-end">
      <Button
        type="submit"
        :label="saving ? 'Submitting...' : 'Submit ticket'"
        icon="pi pi-send"
        :loading="saving"
        :disabled="saving"
      />
    </div>
  </form>
</template>

<style scoped>
.ticket-form {
  display: grid;
  gap: 1.2rem;
}
</style>
