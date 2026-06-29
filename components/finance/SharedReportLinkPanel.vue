<script setup lang="ts">
import type { FlatSummary, ResidentSummary } from '~/types/domain'

type CreateShareResponse = {
  ok: true
  data: {
    link: string
    similarActiveShareId: string | null
    deliveryFailure: string | null
  }
}

type CreatedShareLink = {
  ownerUserId: string
  ownerLabel: string
  flatLabel: string
  link: string
  deliveryFailure: string | null
}

type OwnerFlatRelationship = {
  flatId: string
  blockName: string | null
  flatNumber: string | null
  relationshipType: string
  isActive: boolean
}

type FlatOption = {
  label: string
  value: string
}

const ALL_OWNERS_VALUE = '__ALL_OWNERS__'
const ALL_FLATS_VALUE = '__ALL_FLATS__'
const formatDateTimeLocal = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}T${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`

const monthDateRange = () => {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const formatDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  return { startDate: formatDate(start), endDate: formatDate(end) }
}

const defaultMonthRange = monthDateRange()

const props = defineProps<{
  owners: ResidentSummary[]
  flats: FlatSummary[]
  startDate: string
  endDate: string
}>()

const emit = defineEmits<{
  created: []
}>()

const api = useApi()
const toast = useToast()

const reportTypes = [
  { label: 'Income summary', value: 'INCOME_SUMMARY' },
  { label: 'Expense summary', value: 'EXPENSE_SUMMARY' },
  { label: 'Combined summary', value: 'INCOME_VS_EXPENSE' },
  { label: 'Category expenses', value: 'CATEGORY_EXPENSE_SUMMARY' },
  { label: 'Statement snapshot', value: 'FINANCIAL_STATEMENT' },
]

const deliveryOptions = [
  { label: 'Copy link', value: 'COPY_LINK' },
  { label: 'Email', value: 'EMAIL' },
  { label: 'WhatsApp', value: 'WHATSAPP' },
]

const form = reactive({
  ownerUserId: '',
  flatId: null as string | null,
  reportType: 'INCOME_VS_EXPENSE',
  startDate: props.startDate || defaultMonthRange.startDate,
  endDate: props.endDate || defaultMonthRange.endDate,
  expiresAt: formatDateTimeLocal(new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)),
  note: '',
  oneTimeAccess: false,
  deliveryChannels: ['COPY_LINK'] as string[],
})
const creating = ref(false)
const createdShares = ref<CreatedShareLink[]>([])
const ownerFlatOptionsCache = ref<Record<string, FlatOption[]>>({})

watch(
  () => ({ startDate: props.startDate, endDate: props.endDate }),
  ({ startDate, endDate }) => {
    const fallback = monthDateRange()
    form.startDate = startDate || fallback.startDate
    form.endDate = endDate || fallback.endDate
  },
)

const ownersForSharing = computed(() => {
  const ownersWithRole = props.owners.filter((owner) =>
    owner.role === 'OWNER'
      || owner.role.toLowerCase() === 'owner'
      || owner.relationshipTypes?.includes('OWNER'),
  )
  return ownersWithRole.length ? ownersWithRole : props.owners
})

const ownerLabel = (owner: ResidentSummary) =>
  `${owner.fullName}${owner.email ? ` (${owner.email})` : ''}`

const flatLabelById = computed(() => {
  const lookup = new Map<string, string>()
  for (const flat of props.flats) {
    lookup.set(flat.id, `${flat.blockName} ${flat.flatNumber}`)
  }
  return lookup
})

const ownerOptions = computed(() => [
  { label: 'All owners', value: ALL_OWNERS_VALUE },
  ...ownersForSharing.value.map((owner) => ({
    label: ownerLabel(owner),
    value: owner.id,
  })),
])

const selectedOwners = computed(() => {
  if (form.ownerUserId === ALL_OWNERS_VALUE) return ownersForSharing.value
  return ownersForSharing.value.filter((owner) => owner.id === form.ownerUserId)
})

const selectedOwner = computed(() => {
  if (form.ownerUserId === ALL_OWNERS_VALUE || !form.ownerUserId) return null
  return ownersForSharing.value.find((owner) => owner.id === form.ownerUserId) ?? null
})

const loadOwnerFlats = async (ownerUserId: string) => {
  const cached = ownerFlatOptionsCache.value[ownerUserId]
  if (cached) return cached

  const response = await api<{ ok: true; data: { relationships: OwnerFlatRelationship[] } }>(
    `/api/admin/residents/${ownerUserId}`,
  )

  const relationships = response.data.relationships ?? []
  const options: FlatOption[] = []
  const seenFlatIds = new Set<string>()

  for (const relationship of relationships) {
    if (!relationship.isActive || relationship.relationshipType !== 'OWNER' || !relationship.flatId) {
      continue
    }
    if (seenFlatIds.has(relationship.flatId)) continue

    seenFlatIds.add(relationship.flatId)
    const fallbackLabel = flatLabelById.value.get(relationship.flatId)
    const derivedLabel = `${relationship.blockName ? `${relationship.blockName} ` : ''}${relationship.flatNumber ?? ''}`.trim()
    options.push({
      value: relationship.flatId,
      label: fallbackLabel || derivedLabel || `Flat ${relationship.flatId}`,
    })
  }

  ownerFlatOptionsCache.value[ownerUserId] = options
  return options
}

watch(
  () => form.ownerUserId,
  async (ownerUserId) => {
    createdShares.value = []
    form.flatId = null

    if (!ownerUserId || ownerUserId === ALL_OWNERS_VALUE) {
      return
    }

    try {
      const ownerFlats = await loadOwnerFlats(ownerUserId)
      if (ownerFlats.length === 1) {
        form.flatId = ownerFlats[0]?.value ?? null
      }
    } catch {
      toast.add({
        severity: 'warn',
        summary: 'Unable to load owner flats',
        detail: 'Select a flat manually from all available options.',
        life: 10000,
      })
    }
  },
)

const flatOptions = computed(() => {
  if (form.ownerUserId === ALL_OWNERS_VALUE) {
    return props.flats.map((flat) => ({
      label: `${flat.blockName} ${flat.flatNumber}`,
      value: flat.id,
    }))
  }

  const selectedOwnerValue = selectedOwner.value
  if (!selectedOwnerValue) {
    return props.flats.map((flat) => ({
      label: `${flat.blockName} ${flat.flatNumber}`,
      value: flat.id,
    }))
  }

  const ownerFlats = ownerFlatOptionsCache.value[selectedOwnerValue.id]
  if (!ownerFlats || ownerFlats.length === 0) {
    return props.flats.map((flat) => ({
      label: `${flat.blockName} ${flat.flatNumber}`,
      value: flat.id,
    }))
  }

  if (ownerFlats.length > 1) {
    return [{ label: `All associated flats (${ownerFlats.length})`, value: ALL_FLATS_VALUE }, ...ownerFlats]
  }

  return ownerFlats
})

const resolveFlatTargets = (ownerUserId: string) => {
  if (form.ownerUserId === ALL_OWNERS_VALUE) {
    return [{ label: 'Owner linked flat', value: null }]
  }

  if (form.flatId === ALL_FLATS_VALUE) {
    return (ownerFlatOptionsCache.value[ownerUserId] ?? []).map((flat) => ({
      label: flat.label,
      value: flat.value,
    }))
  }

  if (!form.flatId) {
    return [{ label: 'Auto-selected flat', value: null }]
  }

  return [{
    label: flatLabelById.value.get(form.flatId) || form.flatId,
    value: form.flatId,
  }]
}

const createSharePayload = (ownerUserId: string, flatId: string | null) => ({
  ownerUserId,
  flatId,
  reportType: form.reportType,
  startDate: form.startDate,
  endDate: form.endDate,
  expiresAt: new Date(form.expiresAt).toISOString(),
  note: form.note || null,
  oneTimeAccess: form.oneTimeAccess,
  deliveryChannels: form.deliveryChannels,
})

const createShare = async () => {
  if (!form.ownerUserId) return
  creating.value = true
  createdShares.value = []

  const selected = selectedOwners.value
  if (!selected.length) {
    toast.add({
      severity: 'warn',
      summary: 'No owners available',
      detail: 'Select an owner first.',
      life: 10000,
    })
    creating.value = false
    return
  }

  const failures: string[] = []
  const created: CreatedShareLink[] = []
  const expectedLinkCount = selected.reduce((count, owner) => count + resolveFlatTargets(owner.id).length, 0)

  try {
    for (const owner of selected) {
      const flatTargets = resolveFlatTargets(owner.id)
      if (!flatTargets.length) {
        failures.push(ownerLabel(owner))
        continue
      }

      for (const flat of flatTargets) {
        try {
          const response = await api<CreateShareResponse>('/api/reports/shares', {
            method: 'POST',
            showErrorToast: form.ownerUserId !== ALL_OWNERS_VALUE,
            body: createSharePayload(owner.id, flat.value),
          })

          created.push({
            ownerUserId: owner.id,
            ownerLabel: ownerLabel(owner),
            flatLabel: flat.label,
            link: response.data.link,
            deliveryFailure: response.data.deliveryFailure,
          })
        } catch {
          failures.push(`${ownerLabel(owner)} (${flat.label})`)
        }
      }
    }

    createdShares.value = created

    const deliveryIssues = created
      .map((entry) => entry.deliveryFailure)
      .filter((item): item is string => Boolean(item))
      .join('; ')

    toast.add({
      severity: failures.length || deliveryIssues.length ? 'warn' : 'success',
      summary:
        form.ownerUserId === ALL_OWNERS_VALUE
          ? `Created ${created.length}/${expectedLinkCount} share links`
          : 'Shared',
      detail: [deliveryIssues, failures.length ? `${failures.length} creation failures` : '']
        .filter(Boolean)
        .join(' · ') || undefined,
      life: 10000,
    })

    if (created.length) {
      emit('created')
    }
  } finally {
    creating.value = false
  }
}

const copyLink = async (link: string) => {
  if (!link) return
  await navigator.clipboard?.writeText(link)
  toast.add({ severity: 'success', summary: 'Link copied', life: 10000 })
}
</script>

<template>
  <section class="surface-card shared-report-panel">
    <header class="list-page__header">
      <div>
        <p class="eyebrow">Owner sharing</p>
        <h2>Secure report link</h2>
      </div>
    </header>

    <div class="admin-form-grid">
      <label>
        <span>Owner</span>
        <Select v-model="form.ownerUserId" :options="ownerOptions" option-label="label" option-value="value" filter />
      </label>
      <label>
        <span>Linked flat</span>
        <Select
          v-model="form.flatId"
          :options="flatOptions"
          option-label="label"
          option-value="value"
          show-clear
          filter
        />
      </label>
      <label>
        <span>Report</span>
        <Select v-model="form.reportType" :options="reportTypes" option-label="label" option-value="value" />
      </label>
      <label>
        <span>Expires</span>
        <InputText v-model="form.expiresAt" type="datetime-local" />
      </label>
      <label>
        <span>Start</span>
        <InputText v-model="form.startDate" type="date" />
      </label>
      <label>
        <span>End</span>
        <InputText v-model="form.endDate" type="date" />
      </label>
      <label class="admin-form-grid__full">
        <span>Note</span>
        <Textarea v-model="form.note" rows="2" auto-resize />
      </label>
      <div class="admin-form-grid__full report-checkboxes">
        <label>
          <Checkbox v-model="form.oneTimeAccess" binary />
          <span>One-time access</span>
        </label>
        <MultiSelect
          v-model="form.deliveryChannels"
          :options="deliveryOptions"
          option-label="label"
          option-value="value"
          display="chip"
        />
      </div>
    </div>

    <div class="list-page__exports">
      <Button label="Create link" icon="pi pi-link" :loading="creating" :disabled="!form.ownerUserId" @click="createShare" />
      <Button
        label="Copy"
        icon="pi pi-copy"
        severity="secondary"
        outlined
        :disabled="createdShares.length !== 1"
        @click="copyLink(createdShares[0]?.link ?? '')"
      />
    </div>

    <div v-if="createdShares.length > 0" class="shared-report-links">
      <label v-if="createdShares.length > 1" class="admin-form-grid__full">Created links (copy individually)</label>
      <label v-else class="admin-form-grid__full">Created link</label>

      <div v-if="createdShares.length === 1" class="shared-report-links__single">
        <InputText :model-value="createdShares[0]?.link ?? ''" readonly />
      </div>
      <div v-else class="admin-form-grid__full">
        <div v-for="entry in createdShares" :key="`${entry.ownerUserId}-${entry.link}`" class="shared-report-links__row">
          <InputText :model-value="entry.link" readonly />
          <Button icon="pi pi-copy" outlined severity="secondary" title="Copy link" @click="copyLink(entry.link)" />
          <small>{{ entry.ownerLabel }} · {{ entry.flatLabel }}</small>
        </div>
      </div>
    </div>
  </section>
</template>
