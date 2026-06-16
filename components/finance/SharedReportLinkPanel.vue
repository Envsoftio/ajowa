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
  startDate: props.startDate,
  endDate: props.endDate,
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
  note: '',
  oneTimeAccess: false,
  deliveryChannels: ['COPY_LINK'] as string[],
})
const creating = ref(false)
const createdLink = ref('')

watch(
  () => ({ startDate: props.startDate, endDate: props.endDate }),
  ({ startDate, endDate }) => {
    form.startDate = startDate
    form.endDate = endDate
  },
)

const ownerOptions = computed(() =>
  props.owners.map((owner) => ({
    label: `${owner.fullName} (${owner.email})`,
    value: owner.id,
  })),
)

const flatOptions = computed(() =>
  props.flats.map((flat) => ({
    label: `${flat.blockName} ${flat.flatNumber}`,
    value: flat.id,
  })),
)

const createShare = async () => {
  if (!form.ownerUserId) return
  creating.value = true
  try {
    const response = await api<CreateShareResponse>('/api/reports/shares', {
      method: 'POST',
      body: {
        ...form,
        expiresAt: new Date(form.expiresAt).toISOString(),
        note: form.note || null,
      },
    })
    createdLink.value = response.data.link
    toast.add({
      severity: response.data.deliveryFailure ? 'warn' : 'success',
      summary: response.data.similarActiveShareId ? 'Created with warning' : 'Shared',
      detail: response.data.deliveryFailure ?? undefined,
      life: 4500,
    })
    emit('created')
  } finally {
    creating.value = false
  }
}

const copyLink = async () => {
  if (!createdLink.value) return
  await navigator.clipboard?.writeText(createdLink.value)
  toast.add({ severity: 'success', summary: 'Link copied', life: 2500 })
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
        <Select v-model="form.flatId" :options="flatOptions" option-label="label" option-value="value" show-clear filter />
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
        :disabled="!createdLink"
        @click="copyLink"
      />
    </div>

    <InputText v-if="createdLink" :model-value="createdLink" readonly />
  </section>
</template>
