<script setup lang="ts">
import type { ServiceDepartment, ServiceLocationType, ServicePriority, ServiceRequestSource } from '~/types/domain'
import { serviceCategories, servicePriorities, priorityLabels } from '~/shared/service-requests'
import type { ServiceRequestCreatePayload } from '~/composables/useServiceRequests'

const props = withDefaults(defineProps<{
  flatOptions: Array<{ id: string; label: string }>
  departments?: ServiceDepartment[]
  staffOptions?: Array<{ id: string; fullName: string; email: string }>
  adminMode?: boolean
  saving?: boolean
}>(), {
  departments: () => [],
  staffOptions: () => [],
  adminMode: false,
  saving: false,
})

const emit = defineEmits<{
  submit: [payload: ServiceRequestCreatePayload]
}>()

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
  sourceType: 'RESIDENT_REQUEST' as ServiceRequestSource,
  preferredVisitTime: '',
  emergencyConfirmed: false,
})

watch(() => props.flatOptions, (flats) => {
  if (!form.flatId && flats[0]) {
    form.flatId = flats[0].id
  }
})

const priorityOptions = servicePriorities.map((priority) => ({
  label: priorityLabels[priority],
  value: priority,
}))

const submitForm = () => {
  emit('submit', {
    category: form.category,
    title: form.title,
    description: form.description,
    priority: form.priority,
    locationType: form.locationType,
    flatId: form.locationType === 'FLAT' ? form.flatId : null,
    areaName: form.locationType === 'COMMON_AREA' ? form.areaName : null,
    assetReference: form.locationType === 'SOCIETY_ASSET' ? form.assetReference : null,
    departmentId: props.adminMode ? form.departmentId : null,
    assigneeUserId: props.adminMode ? form.assigneeUserId : null,
    sourceType: props.adminMode ? form.sourceType : 'RESIDENT_REQUEST',
    preferredVisitTime: form.preferredVisitTime || null,
    emergencyConfirmed: form.emergencyConfirmed,
  })
}
</script>

<template>
  <form class="ticket-form" @submit.prevent="submitForm">
    <section class="admin-form-subsection">
      <h3>Problem</h3>
      <div class="admin-form-grid">
        <label>
          <span>Category</span>
          <Select v-model="form.category" :options="[...serviceCategories]" option-label="label" option-value="value" required fluid />
        </label>
        <label>
          <span>Priority</span>
          <Select v-model="form.priority" :options="priorityOptions" option-label="label" option-value="value" required fluid />
        </label>
        <label class="admin-form-grid__full">
          <span>Title</span>
          <InputText v-model="form.title" required maxlength="160" fluid />
        </label>
        <label class="admin-form-grid__full">
          <span>Description</span>
          <Textarea v-model="form.description" required rows="5" auto-resize fluid />
        </label>
      </div>
      <Message v-if="form.priority === 'EMERGENCY'" severity="warn">
        Emergency requests notify the operations team immediately. Confirm this is urgent before submitting.
      </Message>
      <label v-if="form.priority === 'EMERGENCY'" class="admin-toggle-card">
        <span>Confirm emergency priority</span>
        <ToggleSwitch v-model="form.emergencyConfirmed" />
      </label>
    </section>

    <section class="admin-form-subsection">
      <h3>Location</h3>
      <TicketLocationSelector
        v-model:location-type="form.locationType"
        v-model:flat-id="form.flatId"
        v-model:area-name="form.areaName"
        v-model:asset-reference="form.assetReference"
        :flat-options="flatOptions"
      />
      <label>
        <span>Preferred visit time</span>
        <InputText v-model="form.preferredVisitTime" placeholder="Today after 3 PM, tomorrow morning" fluid />
      </label>
    </section>

    <section v-if="adminMode" class="admin-form-subsection">
      <h3>Routing</h3>
      <div class="admin-form-grid">
        <label>
          <span>Source</span>
          <Select
            v-model="form.sourceType"
            :options="['ADMIN_CREATED', 'COMMON_AREA_REPORT', 'STAFF_REPORTED', 'RESIDENT_REQUEST']"
            required
            fluid
          />
        </label>
        <label>
          <span>Department</span>
          <Select v-model="form.departmentId" :options="departments" option-label="name" option-value="id" show-clear fluid />
        </label>
        <label class="admin-form-grid__full">
          <span>Assignee</span>
          <Select v-model="form.assigneeUserId" :options="staffOptions" option-label="fullName" option-value="id" show-clear fluid />
        </label>
      </div>
    </section>

    <div class="admin-inline-actions" style="justify-content: flex-end;">
      <Button type="submit" :label="saving ? 'Submitting...' : 'Submit ticket'" icon="pi pi-send" :loading="saving" />
    </div>
  </form>
</template>

<style scoped>
.ticket-form {
  display: grid;
  gap: 1.2rem;
}
</style>
