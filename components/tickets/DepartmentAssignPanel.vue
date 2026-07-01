<script setup lang="ts">
import type { ServiceDepartment, ServiceRequestSummary } from '~/types/domain'

const props = defineProps<{
  ticket?: ServiceRequestSummary | null
  departments: ServiceDepartment[]
  staffOptions: Array<{ id: string; fullName: string; email: string }>
  saving?: boolean
}>()

const emit = defineEmits<{
  assign: [payload: { departmentId: string; assigneeUserId?: string | null; reason?: string }]
}>()

const departmentId = ref('')
const assigneeUserId = ref<string | null>(null)
const reason = ref('')

watch(() => props.ticket, (ticket) => {
  departmentId.value = ticket?.departmentId ?? ''
  assigneeUserId.value = ticket?.assigneeUserId ?? null
  reason.value = ''
}, { immediate: true })

const selectedDepartment = computed(() =>
  props.departments.find((item) => item.id === departmentId.value),
)

const filteredStaff = computed(() => {
  const activeIds = new Set(
    selectedDepartment.value?.staffAssignments
      ?.filter((item) => item.isActive)
      .map((item) => item.userId) ?? [],
  )

  return props.staffOptions.filter((staff) => activeIds.has(staff.id))
})

const assigneePlaceholder = computed(() => {
  if (!departmentId.value) {
    return 'Choose a department first'
  }

  return filteredStaff.value.length > 0
    ? 'Select staff'
    : 'No active staff mapped'
})

watch(filteredStaff, (staff) => {
  if (assigneeUserId.value && !staff.some((item) => item.id === assigneeUserId.value)) {
    assigneeUserId.value = null
  }
})

const submit = () => {
  if (!departmentId.value) {
    return
  }

  const payload: { departmentId: string; assigneeUserId?: string | null; reason?: string } = {
    departmentId: departmentId.value,
    assigneeUserId: assigneeUserId.value,
  }

  if (reason.value.trim()) {
    payload.reason = reason.value.trim()
  }

  emit('assign', payload)
}
</script>

<template>
  <form class="department-assign-panel" @submit.prevent="submit">
    <TicketSummaryCard v-if="ticket" :ticket="ticket" compact />
    <label>
      <span>Department</span>
      <Select v-model="departmentId" :options="departments" option-label="name" option-value="id" required fluid />
    </label>
    <label>
      <span>Assignee</span>
      <Select
        v-model="assigneeUserId"
        :options="filteredStaff"
        option-label="fullName"
        option-value="id"
        :placeholder="assigneePlaceholder"
        :disabled="!departmentId || filteredStaff.length === 0"
        show-clear
        fluid
      />
    </label>
    <label>
      <span>Reason</span>
      <Textarea v-model="reason" rows="3" auto-resize placeholder="Required when changing an existing assignment" fluid />
    </label>
    <div class="admin-inline-actions" style="justify-content: flex-end;">
      <Button type="submit" label="Save assignment" icon="pi pi-user-plus" :loading="saving" />
    </div>
  </form>
</template>

<style scoped>
.department-assign-panel {
  display: grid;
  gap: 1rem;
}
</style>
