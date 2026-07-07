<script setup lang="ts">
import type { AmenitySummary } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Amenities',
})

const api = useApi()
const toast = useToast()
const dialogVisible = ref(false)
const saving = ref(false)
const editingAmenity = ref<AmenitySummary | null>(null)

const form = reactive({
  code: '',
  name: '',
  description: '',
  location: '',
  capacity: null as number | null,
  isActive: true,
  isBookable: true,
  requiresApproval: true,
  weekdayStart: '09:00',
  weekdayEnd: '22:00',
  weekendStart: '09:00',
  weekendEnd: '23:00',
  minDurationMinutes: 60,
  maxDurationMinutes: 240,
  slotIntervalMinutes: 30,
  minimumLeadHours: 24,
  maximumAdvanceDays: 60,
  cancellationCutoffHours: 24,
  rulesText: '',
})

const { data, pending, refresh } = await useAsyncData('admin-amenities', () =>
  api<{ ok: true; data: AmenitySummary[] }>('/api/admin/amenities'),
)

const amenities = computed(() => data.value?.data ?? [])

const resetForm = () => {
  editingAmenity.value = null
  Object.assign(form, {
    code: '',
    name: '',
    description: '',
    location: '',
    capacity: null,
    isActive: true,
    isBookable: true,
    requiresApproval: true,
    weekdayStart: '09:00',
    weekdayEnd: '22:00',
    weekendStart: '09:00',
    weekendEnd: '23:00',
    minDurationMinutes: 60,
    maxDurationMinutes: 240,
    slotIntervalMinutes: 30,
    minimumLeadHours: 24,
    maximumAdvanceDays: 60,
    cancellationCutoffHours: 24,
    rulesText: '',
  })
}

const firstWindow = (amenity: AmenitySummary, day: string, fallbackStart: string, fallbackEnd: string) => {
  const window = amenity.operatingHours[day]?.[0]
  return {
    start: window?.start ?? fallbackStart,
    end: window?.end ?? fallbackEnd,
  }
}

const openCreate = () => {
  resetForm()
  dialogVisible.value = true
}

const openEdit = (amenity: AmenitySummary) => {
  const weekday = firstWindow(amenity, 'monday', '09:00', '22:00')
  const weekend = firstWindow(amenity, 'saturday', '09:00', '23:00')
  editingAmenity.value = amenity
  Object.assign(form, {
    code: amenity.code,
    name: amenity.name,
    description: amenity.description ?? '',
    location: amenity.location ?? '',
    capacity: amenity.capacity,
    isActive: amenity.isActive,
    isBookable: amenity.isBookable,
    requiresApproval: amenity.requiresApproval,
    weekdayStart: weekday.start,
    weekdayEnd: weekday.end,
    weekendStart: weekend.start,
    weekendEnd: weekend.end,
    minDurationMinutes: amenity.bookingRules.minDurationMinutes ?? 60,
    maxDurationMinutes: amenity.bookingRules.maxDurationMinutes ?? 240,
    slotIntervalMinutes: amenity.bookingRules.slotIntervalMinutes ?? 30,
    minimumLeadHours: amenity.bookingRules.minimumLeadHours ?? 24,
    maximumAdvanceDays: amenity.bookingRules.maximumAdvanceDays ?? 60,
    cancellationCutoffHours: amenity.bookingRules.cancellationCutoffHours ?? 24,
    rulesText: amenity.rulesText ?? '',
  })
  dialogVisible.value = true
}

const buildOperatingHours = () => ({
  monday: [{ start: form.weekdayStart, end: form.weekdayEnd }],
  tuesday: [{ start: form.weekdayStart, end: form.weekdayEnd }],
  wednesday: [{ start: form.weekdayStart, end: form.weekdayEnd }],
  thursday: [{ start: form.weekdayStart, end: form.weekdayEnd }],
  friday: [{ start: form.weekdayStart, end: form.weekdayEnd }],
  saturday: [{ start: form.weekendStart, end: form.weekendEnd }],
  sunday: [{ start: form.weekendStart, end: form.weekendEnd }],
})

const saveAmenity = async () => {
  if (saving.value) return

  saving.value = true
  try {
    const body = {
      code: form.code,
      name: form.name,
      description: form.description || null,
      location: form.location || null,
      capacity: form.capacity,
      isActive: form.isActive,
      isBookable: form.isBookable,
      requiresApproval: form.requiresApproval,
      operatingHours: buildOperatingHours(),
      bookingRules: {
        minDurationMinutes: form.minDurationMinutes,
        maxDurationMinutes: form.maxDurationMinutes,
        slotIntervalMinutes: form.slotIntervalMinutes,
        minimumLeadHours: form.minimumLeadHours,
        maximumAdvanceDays: form.maximumAdvanceDays,
        cancellationCutoffHours: form.cancellationCutoffHours,
      },
      rulesText: form.rulesText || null,
    }
    const path = editingAmenity.value
      ? `/api/admin/amenities/${editingAmenity.value.id}`
      : '/api/admin/amenities'

    await api(path, {
      method: editingAmenity.value ? 'PATCH' : 'POST',
      body,
    })
    toast.add({ severity: 'success', summary: 'Amenity saved', detail: form.name, life: 10000 })
    dialogVisible.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Amenities</h1>
          <p>Configure bookable society facilities, capacity, timing, and booking rules.</p>
        </div>
        <div class="list-page__exports">
          <Button label="New amenity" icon="pi pi-plus" @click="openCreate" />
          <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined @click="() => refresh()" />
        </div>
      </header>

      <AppSkeletonState v-if="pending" />
      <AppState
        v-else-if="amenities.length === 0"
        variant="empty"
        title="No amenities"
        message="Add clubhouse or shared facilities before residents can request bookings."
      />
      <AppDataTable v-else :value="amenities" responsive-layout="scroll" class="list-page__table" data-key="id">
        <Column field="name" header="Amenity">
          <template #body="{ data: row }">
            <strong>{{ row.name }}</strong>
            <p class="table-muted">{{ row.code }} · {{ row.location || 'No location' }}</p>
          </template>
        </Column>
        <Column field="capacity" header="Capacity">
          <template #body="{ data: row }">{{ row.capacity ?? '-' }}</template>
        </Column>
        <Column field="bookingRules" header="Rules">
          <template #body="{ data: row }">
            {{ row.bookingRules.minDurationMinutes ?? 60 }}-{{ row.bookingRules.maxDurationMinutes ?? 240 }} min
            <p class="table-muted">{{ row.bookingRules.minimumLeadHours ?? 24 }}h lead · {{ row.bookingRules.maximumAdvanceDays ?? 60 }}d advance</p>
          </template>
        </Column>
        <Column field="isActive" header="State">
          <template #body="{ data: row }">
            <div class="amenity-state-tags">
              <Tag :severity="row.isActive ? 'success' : 'danger'" :value="row.isActive ? 'Active' : 'Inactive'" rounded />
              <Tag :severity="row.isBookable ? 'info' : 'secondary'" :value="row.isBookable ? 'Bookable' : 'Not bookable'" rounded />
            </div>
          </template>
        </Column>
        <Column header="Actions" style="width: 120px">
          <template #body="{ data: row }">
            <Button icon="pi pi-pencil" text rounded aria-label="Edit amenity" @click="openEdit(row)" />
          </template>
        </Column>
      </AppDataTable>
    </section>

    <Dialog v-model:visible="dialogVisible" modal :header="editingAmenity ? 'Edit amenity' : 'New amenity'" class="p-dialog-custom" :style="{ width: 'min(94vw, 56rem)' }">
      <div class="admin-form-grid">
        <label>
          <span>Code</span>
          <InputText v-model="form.code" placeholder="CLUBHOUSE" />
        </label>
        <label>
          <span>Name</span>
          <InputText v-model="form.name" placeholder="Clubhouse" />
        </label>
        <label>
          <span>Location</span>
          <InputText v-model="form.location" placeholder="Clubhouse" />
        </label>
        <label>
          <span>Capacity</span>
          <InputNumber v-model="form.capacity" :min="1" fluid />
        </label>
        <label class="admin-form-grid__full">
          <span>Description</span>
          <Textarea v-model="form.description" rows="2" auto-resize />
        </label>

        <label>
          <span>Weekday start</span>
          <InputText v-model="form.weekdayStart" type="time" step="1800" />
        </label>
        <label>
          <span>Weekday end</span>
          <InputText v-model="form.weekdayEnd" type="time" step="1800" />
        </label>
        <label>
          <span>Weekend start</span>
          <InputText v-model="form.weekendStart" type="time" step="1800" />
        </label>
        <label>
          <span>Weekend end</span>
          <InputText v-model="form.weekendEnd" type="time" step="1800" />
        </label>

        <label>
          <span>Min duration</span>
          <InputNumber v-model="form.minDurationMinutes" :min="1" suffix=" min" fluid />
        </label>
        <label>
          <span>Max duration</span>
          <InputNumber v-model="form.maxDurationMinutes" :min="1" suffix=" min" fluid />
        </label>
        <label>
          <span>Slot interval</span>
          <InputNumber v-model="form.slotIntervalMinutes" :min="1" suffix=" min" fluid />
        </label>
        <label>
          <span>Minimum lead</span>
          <InputNumber v-model="form.minimumLeadHours" :min="0" suffix=" h" fluid />
        </label>
        <label>
          <span>Advance limit</span>
          <InputNumber v-model="form.maximumAdvanceDays" :min="1" suffix=" d" fluid />
        </label>
        <label>
          <span>Cancellation cutoff</span>
          <InputNumber v-model="form.cancellationCutoffHours" :min="0" suffix=" h" fluid />
        </label>

        <label class="admin-toggle-card">
          <ToggleSwitch v-model="form.isActive" />
          <span>Active</span>
        </label>
        <label class="admin-toggle-card">
          <ToggleSwitch v-model="form.isBookable" />
          <span>Bookable</span>
        </label>
        <label class="admin-toggle-card">
          <ToggleSwitch v-model="form.requiresApproval" />
          <span>Approval required</span>
        </label>

        <label class="admin-form-grid__full">
          <span>Rules text</span>
          <Textarea v-model="form.rulesText" rows="3" auto-resize />
        </label>
      </div>
      <div class="admin-inline-actions dialog-actions amenity-dialog-actions">
        <Button label="Close" severity="secondary" outlined @click="dialogVisible = false" />
        <Button label="Save" icon="pi pi-save" :loading="saving" @click="saveAmenity" />
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.amenity-state-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.amenity-dialog-actions {
  margin-top: 1.5rem;
}
</style>
