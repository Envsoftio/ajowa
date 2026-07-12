<script setup lang="ts">
import type { AmenityAvailability, AmenityBlockedDates, AmenitySummary } from '~/types/domain'

definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'New Booking',
})

type FlatOption = {
  id: string
  label: string
  relationshipType: string
}

type TimeOption = {
  label: string
  value: string
}

type BookingField = 'flatId' | 'amenityId' | 'date' | 'startTime' | 'endTime' | 'purpose' | 'rulesAccepted'

type ApiErrorPayloadShape = {
  message?: string
  fieldErrors?: Record<string, string[]>
  details?: {
    fieldErrors?: Record<string, string[]>
  }
  data?: ApiErrorPayloadShape
}

const weekdayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

const api = useApi()
const toast = useToast()
const router = useRouter()
const saving = ref(false)
const createdBooking = ref<{ id: string; bookingNumber: string } | null>(null)
const dateValue = ref<Date | null>(null)
const fieldErrors = ref<Partial<Record<BookingField, string>>>({})
const nowMs = ref(Date.now())

const form = reactive({
  amenityId: '',
  flatId: '',
  date: '',
  startTime: '',
  endTime: '',
  guestCount: null as number | null,
  purpose: '',
  residentNotes: '',
  rulesAccepted: false,
})

const { data: optionsData } = await useAsyncData('my-amenity-booking-options', () =>
  api<{ ok: true; data: { amenities: AmenitySummary[]; flats: FlatOption[] } }>('/api/my/amenities'),
)

const amenities = computed(() => optionsData.value?.data.amenities ?? [])
const flats = computed(() => optionsData.value?.data.flats ?? [])
const selectedAmenity = computed(() => amenities.value.find((amenity) => amenity.id === form.amenityId) ?? null)

if (!form.amenityId && amenities.value[0]) {
  form.amenityId = amenities.value[0].id
}
if (!form.flatId && flats.value[0]) {
  form.flatId = flats.value[0].id
}

const { data: availabilityData, pending: availabilityPending, refresh: refreshAvailability } = await useAsyncData(
  'my-amenity-availability',
  async (): Promise<{ ok: true; data: AmenityAvailability } | null> => {
    if (!form.amenityId || !form.date) return null
    return api<{ ok: true; data: AmenityAvailability }>(`/api/my/amenities/${form.amenityId}/availability`, {
      query: { date: form.date },
    })
  },
  { watch: [() => form.amenityId, () => form.date] },
)

const availability = computed(() => availabilityData.value?.data ?? null)

const dateToKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const dateKeyToDate = (value: string) => {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const addDays = (date: Date, days: number) => {
  const value = new Date(date)
  value.setDate(value.getDate() + days)
  return value
}

const timeToMinutes = (value: string | null | undefined) => {
  const match = value?.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null

  return Number(match[1]) * 60 + Number(match[2])
}

const minutesToTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

const formatTimeLabel = (value: string) => {
  const minutes = timeToMinutes(value)
  if (minutes == null) return value

  const hours = Math.floor(minutes / 60)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(minutes % 60).padStart(2, '0')} ${suffix}`
}

const alignToNextSlot = (minutes: number, interval: number) => Math.ceil(minutes / interval) * interval

const selectedWeekday = computed(() => {
  if (!form.date) return null
  const day = new Date(`${form.date}T12:00:00`).getDay()
  return weekdayKeys[day] ?? null
})

const slotIntervalMinutes = computed(() => selectedAmenity.value?.bookingRules.slotIntervalMinutes ?? 30)
const minDurationMinutes = computed(() => selectedAmenity.value?.bookingRules.minDurationMinutes ?? 60)
const maxDurationMinutes = computed(() => selectedAmenity.value?.bookingRules.maxDurationMinutes ?? 240)
const minimumLeadHours = computed(() => selectedAmenity.value?.bookingRules.minimumLeadHours ?? 0)
const maximumAdvanceDays = computed(() => selectedAmenity.value?.bookingRules.maximumAdvanceDays ?? 60)

const minBookingDate = computed(() => {
  const today = new Date(nowMs.value)
  return new Date(today.getFullYear(), today.getMonth(), today.getDate())
})

const maxBookingDate = computed(() => addDays(new Date(nowMs.value), maximumAdvanceDays.value))
const blockedDatesStart = computed(() => dateToKey(minBookingDate.value))
const blockedDatesEnd = computed(() => dateToKey(maxBookingDate.value))

const { data: blockedDatesData } = await useAsyncData(
  'my-amenity-blocked-dates',
  async (): Promise<{ ok: true; data: AmenityBlockedDates } | null> => {
    if (!form.amenityId) return null
    return api<{ ok: true; data: AmenityBlockedDates }>(`/api/my/amenities/${form.amenityId}/blocked-dates`, {
      query: {
        startDate: blockedDatesStart.value,
        endDate: blockedDatesEnd.value,
      },
    })
  },
  { watch: [() => form.amenityId, blockedDatesStart, blockedDatesEnd] },
)

const blockedDateKeys = computed(() => new Set(blockedDatesData.value?.data.blockedDates ?? []))
const disabledBookingDates = computed(() =>
  [...blockedDateKeys.value].map((date) => dateKeyToDate(date)),
)

const selectedOperatingWindows = computed(() => {
  if (!selectedAmenity.value || !selectedWeekday.value) return []
  return selectedAmenity.value.operatingHours[selectedWeekday.value] ?? []
})

const uniqueTimeOptions = (values: string[]) => {
  const uniqueValues = [...new Set(values)].sort()
  return uniqueValues.map((value) => ({ label: formatTimeLabel(value), value }))
}

const dateTimeAtMinutes = (date: string, minutes: number) => new Date(`${date}T${minutesToTime(minutes)}:00`)

const slotOverlapsUnavailable = (startMinutes: number, endMinutes: number) => {
  if (!form.date) return false

  const startsAt = dateTimeAtMinutes(form.date, startMinutes)
  const endsAt = dateTimeAtMinutes(form.date, endMinutes)

  return (availability.value?.unavailableWindows ?? []).some((window) =>
    startsAt < new Date(window.endsAt) && endsAt > new Date(window.startsAt),
  )
}

const startMeetsBookingWindow = (startMinutes: number) => {
  if (!form.date) return false

  const startsAt = dateTimeAtMinutes(form.date, startMinutes).getTime()
  const earliestStart = nowMs.value + minimumLeadHours.value * 60 * 60 * 1000
  const latestStart = nowMs.value + maximumAdvanceDays.value * 24 * 60 * 60 * 1000
  return startsAt >= earliestStart && startsAt <= latestStart
}

const endTimeValuesForStart = (startTime: number) => {
  const interval = Math.max(1, slotIntervalMinutes.value)
  const values: string[] = []

  if (!startMeetsBookingWindow(startTime)) {
    return values
  }

  for (const window of selectedOperatingWindows.value) {
    const windowStart = timeToMinutes(window.start)
    const windowEnd = timeToMinutes(window.end)
    if (windowStart == null || windowEnd == null || startTime < windowStart || startTime >= windowEnd) continue

    const firstEndTime = alignToNextSlot(startTime + minDurationMinutes.value, interval)
    const lastEndTime = Math.min(startTime + maxDurationMinutes.value, windowEnd)
    for (let minutes = firstEndTime; minutes <= lastEndTime; minutes += interval) {
      if (!slotOverlapsUnavailable(startTime, minutes)) {
        values.push(minutesToTime(minutes))
      }
    }
  }

  return values
}

const startTimeOptions = computed<TimeOption[]>(() => {
  if (!form.date || !selectedAmenity.value) return []

  const interval = Math.max(1, slotIntervalMinutes.value)
  const values: string[] = []

  for (const window of selectedOperatingWindows.value) {
    const start = timeToMinutes(window.start)
    const end = timeToMinutes(window.end)
    if (start == null || end == null) continue

    for (let minutes = alignToNextSlot(start, interval); minutes + minDurationMinutes.value <= end; minutes += interval) {
      if (endTimeValuesForStart(minutes).length > 0) {
        values.push(minutesToTime(minutes))
      }
    }
  }

  return uniqueTimeOptions(values)
})

const endTimeOptions = computed<TimeOption[]>(() => {
  const startTime = timeToMinutes(form.startTime)
  if (startTime == null) return []

  return uniqueTimeOptions(endTimeValuesForStart(startTime))
})

const startTimePlaceholder = computed(() => {
  if (!form.date) return 'Select date first'
  if (!startTimeOptions.value.length) return 'No slots available'
  return 'Select start time'
})

const endTimePlaceholder = computed(() => {
  if (!form.startTime) return 'Select start first'
  if (!endTimeOptions.value.length) return 'No end slots available'
  return 'Select end time'
})

const selectedDateUnavailable = computed(() =>
  Boolean(form.date && !availabilityPending.value && availability.value && startTimeOptions.value.length === 0),
)

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const localDateTimeToIso = (date: string, time: string) => {
  if (!date || !time) {
    return ''
  }

  const value = new Date(`${date}T${time}:00`)
  return Number.isNaN(value.getTime()) ? '' : value.toISOString()
}

const fieldError = (field: BookingField) => fieldErrors.value[field]

const clearFieldError = (field: BookingField) => {
  if (!fieldErrors.value[field]) return
  fieldErrors.value[field] = ''
}

const getApiPayload = (error: unknown) => {
  const apiError = error as {
    data?: ApiErrorPayloadShape
  }
  return apiError.data?.data ?? apiError.data
}

const getFirstFieldErrorMessage = (payload?: ApiErrorPayloadShape | null) => {
  const errors = payload?.fieldErrors ?? payload?.details?.fieldErrors
  const firstFieldError = Object.entries(errors ?? {})[0]

  if (!firstFieldError) return null

  const [field, messages] = firstFieldError
  const message = messages[0]

  return message ? `${field}: ${message}` : null
}

const getApiErrorMessage = (error: unknown, fallback = 'Booking submission failed. Please review the form and try again.') => {
  const apiError = error as {
    message?: string
    statusMessage?: string
  }
  const payload = getApiPayload(error)
  const detail =
    getFirstFieldErrorMessage(payload) ??
    payload?.message ??
    apiError.message ??
    apiError.statusMessage

  if (
    !detail ||
    /^(\[.*\]\s*)?fetch failed$/i.test(detail) ||
    /^something went wrong\.?( please try again\.)?$/i.test(detail)
  ) {
    return fallback
  }

  return detail
}

let clockTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  clockTimer = setInterval(() => {
    nowMs.value = Date.now()
  }, 60_000)
})

onBeforeUnmount(() => {
  if (clockTimer) {
    clearInterval(clockTimer)
  }
})

const applyApiFieldErrors = (error: unknown) => {
  fieldErrors.value = {}

  const payload = getApiPayload(error)
  const errors = payload?.fieldErrors ?? payload?.details?.fieldErrors
  if (!errors) return

  if (errors.flatId?.[0]) fieldErrors.value.flatId = errors.flatId[0]
  if (errors.amenityId?.[0]) fieldErrors.value.amenityId = errors.amenityId[0]
  if (errors.purpose?.[0]) fieldErrors.value.purpose = errors.purpose[0]
  if (errors.rulesAccepted?.[0]) fieldErrors.value.rulesAccepted = errors.rulesAccepted[0]

  if (errors.startsAt?.[0]) {
    if (!form.date) {
      fieldErrors.value.date = errors.startsAt[0]
    } else {
      fieldErrors.value.startTime = errors.startsAt[0]
    }
  }

  if (errors.endsAt?.[0]) {
    if (!form.date) {
      fieldErrors.value.date ??= errors.endsAt[0]
    } else {
      fieldErrors.value.endTime = errors.endsAt[0]
    }
  }
}

watch(dateValue, (value) => {
  form.date = value ? dateToKey(value) : ''
  clearFieldError('date')
})

watch(() => form.amenityId, () => {
  dateValue.value = null
  form.date = ''
  clearFieldError('amenityId')
  clearFieldError('date')
  clearFieldError('startTime')
  clearFieldError('endTime')
})

watch(blockedDateKeys, (dates) => {
  if (!form.date || !dates.has(form.date)) return

  dateValue.value = null
  form.date = ''
  toast.add({
    severity: 'warn',
    summary: 'Date unavailable',
    detail: 'That date has no available booking slots. Choose another date.',
    life: 7000,
  })
})

watch([() => form.amenityId, () => form.date], () => {
  form.startTime = ''
  form.endTime = ''
})

watch(startTimeOptions, (options) => {
  if (form.startTime && !options.some((option) => option.value === form.startTime)) {
    form.startTime = ''
    form.endTime = ''
  }
})

watch(endTimeOptions, (options) => {
  if (!form.startTime) {
    form.endTime = ''
    return
  }

  if (!options.some((option) => option.value === form.endTime)) {
    form.endTime = options[0]?.value ?? ''
  }
})

watch(() => form.flatId, () => clearFieldError('flatId'))
watch(() => form.startTime, () => clearFieldError('startTime'))
watch(() => form.endTime, () => clearFieldError('endTime'))
watch(() => form.purpose, () => clearFieldError('purpose'))
watch(() => form.rulesAccepted, () => clearFieldError('rulesAccepted'))

const submit = async () => {
  if (saving.value) {
    return
  }

  fieldErrors.value = {}
  saving.value = true
  try {
    const response = await api<{ ok: true; data: { id: string; bookingNumber: string } }>('/api/my/amenity-bookings', {
      method: 'POST',
      body: {
        amenityId: form.amenityId,
        flatId: form.flatId,
        startsAt: localDateTimeToIso(form.date, form.startTime),
        endsAt: localDateTimeToIso(form.date, form.endTime),
        guestCount: form.guestCount,
        purpose: form.purpose,
        residentNotes: form.residentNotes || null,
        rulesAccepted: form.rulesAccepted,
      },
    })
    createdBooking.value = response.data
    toast.add({ severity: 'success', summary: 'Booking submitted', detail: response.data.bookingNumber, life: 10000 })
  } catch (error) {
    applyApiFieldErrors(error)
    toast.add({
      severity: 'error',
      summary: 'Booking not submitted',
      detail: getApiErrorMessage(error),
      life: 7000,
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="landing-page">
    <section class="hero-panel">
      <Tag severity="info" value="Amenity Booking" rounded />
      <h1>Request an amenity booking</h1>
      <p>Select a flat, amenity, date, and time. The request goes to admins for approval.</p>
    </section>

    <section v-if="createdBooking" class="surface-card booking-success">
      <Tag severity="success" value="Submitted" rounded />
      <h2>{{ createdBooking.bookingNumber }}</h2>
      <p>Your booking request is waiting for admin approval.</p>
      <div class="admin-inline-actions">
        <Button label="View booking" icon="pi pi-eye" @click="router.push(`/my/amenity-bookings/${createdBooking?.id}`)" />
        <Button label="My bookings" icon="pi pi-list" severity="secondary" outlined @click="router.push('/my/amenity-bookings')" />
      </div>
    </section>

    <section v-else class="surface-card">
      <div class="admin-form-grid">
        <label>
          <span>Flat <span class="required-marker">*</span></span>
          <Select
            v-model="form.flatId"
            :options="flats"
            option-label="label"
            option-value="id"
            placeholder="Select flat"
            :invalid="Boolean(fieldError('flatId'))"
          />
          <small v-if="fieldError('flatId')" class="field-error">{{ fieldError('flatId') }}</small>
        </label>

        <label>
          <span>Amenity <span class="required-marker">*</span></span>
          <Select
            v-model="form.amenityId"
            :options="amenities"
            option-label="name"
            option-value="id"
            placeholder="Select amenity"
            :invalid="Boolean(fieldError('amenityId'))"
          />
          <small v-if="fieldError('amenityId')" class="field-error">{{ fieldError('amenityId') }}</small>
        </label>

        <label>
          <span>Date <span class="required-marker">*</span></span>
          <DatePicker
            v-model="dateValue"
            :min-date="minBookingDate"
            :max-date="maxBookingDate"
            :disabled-dates="disabledBookingDates"
            date-format="dd/mm/yy"
            placeholder="Select date"
            show-icon
            fluid
            :manual-input="false"
            :invalid="Boolean(fieldError('date'))"
          />
          <small v-if="fieldError('date')" class="field-error">{{ fieldError('date') }}</small>
        </label>

        <label>
          <span>Start time <span class="required-marker">*</span></span>
          <Select
            v-model="form.startTime"
            :options="startTimeOptions"
            option-label="label"
            option-value="value"
            :placeholder="startTimePlaceholder"
            :disabled="!startTimeOptions.length"
            fluid
            :invalid="Boolean(fieldError('startTime'))"
          />
          <small v-if="fieldError('startTime')" class="field-error">{{ fieldError('startTime') }}</small>
        </label>

        <label>
          <span>End time <span class="required-marker">*</span></span>
          <Select
            v-model="form.endTime"
            :options="endTimeOptions"
            option-label="label"
            option-value="value"
            :placeholder="endTimePlaceholder"
            :disabled="!form.startTime || !endTimeOptions.length"
            fluid
            :invalid="Boolean(fieldError('endTime'))"
          />
          <small v-if="fieldError('endTime')" class="field-error">{{ fieldError('endTime') }}</small>
        </label>

        <label>
          <span>Guests</span>
          <InputNumber v-model="form.guestCount" :min="1" :max="selectedAmenity?.capacity ?? undefined" fluid />
        </label>

        <label class="admin-form-grid__full">
          <span>Purpose <span class="required-marker">*</span></span>
          <Textarea
            v-model="form.purpose"
            rows="3"
            auto-resize
            placeholder="Family function, meeting, celebration..."
            :invalid="Boolean(fieldError('purpose'))"
          />
          <small v-if="fieldError('purpose')" class="field-error">{{ fieldError('purpose') }}</small>
        </label>

        <label class="admin-form-grid__full">
          <span>Notes</span>
          <Textarea v-model="form.residentNotes" rows="3" auto-resize placeholder="Special instructions or setup notes" />
        </label>
      </div>

      <section v-if="selectedAmenity" class="booking-rules-panel">
        <div>
          <p class="eyebrow">Rules</p>
          <h3>{{ selectedAmenity.name }}</h3>
          <p>{{ selectedAmenity.rulesText || 'Follow society rules, approved timing, cleanliness, and guest limits.' }}</p>
        </div>
        <div class="booking-rule-metrics">
          <span>Capacity {{ selectedAmenity.capacity ?? '-' }}</span>
          <span>Lead {{ selectedAmenity.bookingRules.minimumLeadHours ?? 0 }}h</span>
          <span>Duration {{ selectedAmenity.bookingRules.minDurationMinutes ?? 60 }}-{{ selectedAmenity.bookingRules.maxDurationMinutes ?? 240 }} min</span>
        </div>
      </section>

      <section v-if="form.date && form.amenityId" class="availability-panel">
        <header class="availability-panel__header">
          <div>
            <p class="eyebrow">Availability</p>
            <h3>Unavailable windows</h3>
          </div>
          <Button icon="pi pi-refresh" text rounded aria-label="Refresh availability" @click="() => refreshAvailability()" />
        </header>

        <AppState v-if="availabilityPending" variant="loading" title="Checking availability" message="Loading approved bookings and blackouts." />
        <template v-else>
          <Message v-if="selectedDateUnavailable && availability?.unavailableWindows.length" severity="warn" :closable="false">
            This date has no available booking slots. Choose another date.
          </Message>
          <div v-if="availability?.unavailableWindows.length" class="availability-list">
            <article v-for="window in availability.unavailableWindows" :key="`${window.type}-${window.id}`" class="availability-window">
              <strong>{{ window.title }}</strong>
              <span>{{ formatDateTime(window.startsAt) }} - {{ formatDateTime(window.endsAt) }}</span>
            </article>
          </div>
          <AppState
            v-else-if="selectedDateUnavailable"
            variant="empty"
            title="No slots available"
            message="This date has no available booking slots. Choose another date."
          />
          <AppState v-else variant="empty" title="No unavailable windows" message="No approved booking or blackout is listed for this date." />
        </template>
      </section>

      <label class="booking-agreement">
        <Checkbox v-model="form.rulesAccepted" binary :invalid="Boolean(fieldError('rulesAccepted'))" />
        <span>I agree to follow the society amenity rules and approved booking time.</span>
      </label>
      <small v-if="fieldError('rulesAccepted')" class="field-error">{{ fieldError('rulesAccepted') }}</small>

      <div class="admin-inline-actions booking-actions">
        <Button label="Submit request" icon="pi pi-send" :loading="saving" @click="submit" />
        <Button label="Cancel" icon="pi pi-times" severity="secondary" outlined @click="router.push('/my/amenity-bookings')" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.booking-success,
.booking-rules-panel,
.availability-panel {
  display: grid;
  gap: 0.75rem;
}

.booking-success h2,
.booking-success p,
.booking-rules-panel h3,
.booking-rules-panel p,
.availability-panel h3 {
  margin: 0;
}

.booking-rules-panel,
.availability-panel {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--surface-border);
}

.booking-rule-metrics,
.availability-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.booking-rule-metrics span,
.availability-window {
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  background: var(--surface-ground);
}

.availability-panel__header,
.availability-window,
.booking-agreement {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.availability-window {
  align-items: flex-start;
  flex-direction: column;
}

.booking-agreement {
  justify-content: flex-start;
  margin-top: 1.25rem;
}

.required-marker,
.field-error {
  color: var(--red-500);
}

.field-error {
  display: block;
  margin-top: 0.35rem;
}

.booking-actions {
  justify-content: flex-end;
  margin-top: 1.25rem;
}
</style>
