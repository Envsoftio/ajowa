<script setup lang="ts">
import { getApiErrorMessage } from '~/composables/useApi'
import type {
  BankAccount,
  BillingPeriod,
  FinanceCategory,
  FinancePaymentMode,
  FinanceTransaction,
  FinanceTransactionType,
  SocietyPolicySettings,
} from '~/types/domain'

type TransactionSavePayload = {
  id: string
  status: string
  attachmentUploaded: boolean
  attachmentError?: string
}

const props = defineProps<{
  initialType: FinanceTransactionType
  transaction?: FinanceTransaction | null
  categories: FinanceCategory[]
  bankAccounts: BankAccount[]
  periods: BillingPeriod[]
  policy: SocietyPolicySettings
}>()

const emit = defineEmits<{
  created: [payload: TransactionSavePayload]
  updated: [payload: TransactionSavePayload]
}>()

type SaveResponse = { ok: true; data: { id: string; status: string } }
type TransactionsResponse = { ok: true; data: { items: FinanceTransaction[] } }

const api = useApi()
const toast = useToast()
const { attachment, setAttachment, clearAttachment, uploadAttachment } =
  useFinanceAttachments()

const paymentModes: Array<{ label: string; value: FinancePaymentMode }> = [
  { label: 'Cash', value: 'CASH' },
  { label: 'Bank transfer', value: 'BANK_TRANSFER' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Card', value: 'CARD' },
  { label: 'Other', value: 'OTHER' },
]
const paymentModeValues = paymentModes.map((mode) => mode.value)

const form = reactive({
  transactionType: props.initialType,
  categoryId: '',
  bankAccountId: '',
  billingPeriodId: null as string | null,
  title: '',
  description: '',
  counterpartyName: '',
  voucherNumber: '',
  transactionDate: new Date().toISOString().slice(0, 10),
  amount: 0,
  mode: 'BANK_TRANSFER' as FinancePaymentMode,
  utrNumber: '',
  chequeNumber: '',
  chequeDate: '',
  tags: '',
  internalNotes: '',
})

const isEditing = computed(() => Boolean(props.transaction))
const saving = ref(false)
const duplicateWarnings = ref<FinanceTransaction[]>([])
const highValueConfirmed = ref(false)
let hydratingTransaction = false

const splitDescriptionMetadata = (value: string | null) => {
  const metadata = {
    description: '',
    mode: 'BANK_TRANSFER' as FinancePaymentMode,
    utrNumber: '',
    chequeNumber: '',
    chequeDate: '',
    tags: '',
    internalNotes: '',
  }
  const notes: string[] = []

  for (const line of (value ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const [label = '', ...rest] = trimmed.split(':')
    const content = rest.join(':').trim()
    const normalizedLabel = label.toLowerCase()

    if (normalizedLabel === 'mode' && paymentModeValues.includes(content as FinancePaymentMode)) {
      metadata.mode = content as FinancePaymentMode
    } else if (normalizedLabel === 'utr') {
      metadata.utrNumber = content
    } else if (normalizedLabel === 'cheque') {
      metadata.chequeNumber = content
    } else if (normalizedLabel === 'cheque date') {
      metadata.chequeDate = content
    } else if (normalizedLabel === 'tags') {
      metadata.tags = content
    } else if (normalizedLabel === 'internal notes') {
      metadata.internalNotes = content
    } else {
      notes.push(line)
    }
  }

  metadata.description = notes.join('\n').trim()
  return metadata
}

const hydrateTransaction = (transaction: FinanceTransaction) => {
  const metadata = splitDescriptionMetadata(transaction.description)
  hydratingTransaction = true
  form.transactionType = transaction.transactionType
  form.categoryId = transaction.categoryId
  form.bankAccountId = transaction.bankAccountId ?? ''
  form.billingPeriodId = transaction.billingPeriodId
  form.title = transaction.title
  form.description = metadata.description
  form.counterpartyName = transaction.counterpartyName ?? ''
  form.voucherNumber = transaction.voucherNumber ?? ''
  form.transactionDate = transaction.transactionDate
  form.amount = transaction.amount
  form.mode = metadata.mode
  form.utrNumber = metadata.utrNumber
  form.chequeNumber = metadata.chequeNumber
  form.chequeDate = metadata.chequeDate
  form.tags = metadata.tags
  form.internalNotes = metadata.internalNotes
  clearAttachment()
  highValueConfirmed.value = false
  nextTick(() => {
    hydratingTransaction = false
  })
}

watch(
  () => props.transaction,
  (transaction) => {
    if (transaction) {
      hydrateTransaction(transaction)
    }
  },
  { immediate: true },
)

const selectedCategory = computed(
  () =>
    props.categories.find((category) => category.id === form.categoryId) ??
    null,
)

const selectedAccount = computed(
  () =>
    props.bankAccounts.find((account) => account.id === form.bankAccountId) ??
    null,
)

const selectedPeriod = computed(
  () => props.periods.find((period) => period.id === form.billingPeriodId) ?? null,
)

const requiresAttachment = computed(
  () =>
    form.transactionType === 'EXPENSE' &&
    (props.policy.attachmentsRequired ||
      Boolean(selectedCategory.value?.requiresAttachment)),
)

const hasExistingAttachment = computed(() => Boolean(props.transaction?.hasAttachments))
const periodLocked = computed(() => Boolean(selectedPeriod.value?.isLocked))

const duplicateKey = computed(() =>
  [
    form.counterpartyName.trim().toLowerCase(),
    form.voucherNumber.trim().toLowerCase(),
    form.amount,
    form.transactionDate,
    form.transactionType,
  ].join('|'),
)

const descriptionWithMetadata = computed(() => {
  const lines = [form.description.trim()].filter(Boolean)
  const metadata = [
    `Mode: ${form.mode}`,
    form.utrNumber ? `UTR: ${form.utrNumber}` : '',
    form.chequeNumber ? `Cheque: ${form.chequeNumber}` : '',
    form.chequeDate ? `Cheque date: ${form.chequeDate}` : '',
    form.tags ? `Tags: ${form.tags}` : '',
    form.internalNotes ? `Internal notes: ${form.internalNotes}` : '',
  ].filter(Boolean)

  return [...lines, ...metadata].join('\n')
})

const chooseSafeDefaultAccount = () => {
  const storageKey =
    form.transactionType === 'EXPENSE'
      ? 'finance:lastPaidFromAccountId'
      : 'finance:lastReceivingAccountId'
  const lastUsed = import.meta.client ? localStorage.getItem(storageKey) : null
  const account =
    props.bankAccounts.find((item) => item.id === lastUsed && item.isActive) ??
    props.bankAccounts.find((item) => item.isDefault && item.isActive) ??
    props.bankAccounts.find((item) => item.isActive)
  form.bankAccountId = account?.id ?? ''
}

const chooseDefaultCategory = () => {
  const category = props.categories.find(
    (item) => item.transactionType === form.transactionType && item.isActive,
  )
  form.categoryId = category?.id ?? ''
}

watch(
  () => form.transactionType,
  () => {
    if (hydratingTransaction) return
    chooseDefaultCategory()
    chooseSafeDefaultAccount()
    highValueConfirmed.value = false
  },
  { immediate: true },
)

watch(duplicateKey, async () => {
  if (!form.counterpartyName || !form.amount || !form.transactionDate) {
    duplicateWarnings.value = []
    return
  }

  const response = await api<TransactionsResponse>(
    '/api/admin/finance/transactions',
    {
      query: {
        transactionType: form.transactionType,
        counterparty: form.counterpartyName,
        voucherNumber: form.voucherNumber || undefined,
        dateFrom: form.transactionDate,
        dateTo: form.transactionDate,
        minAmount: form.amount,
        maxAmount: form.amount,
        pageSize: 5,
      },
    },
  )
  duplicateWarnings.value = response.data.items.filter(
    (item) => item.id !== props.transaction?.id,
  )
})

const validate = (submitForPosting: boolean) => {
  if (!form.categoryId || !selectedCategory.value?.isActive) {
    toast.add({ severity: 'warn', summary: 'Category required', life: 10000 })
    return false
  }
  if (!form.bankAccountId || !selectedAccount.value?.isActive) {
    toast.add({ severity: 'warn', summary: 'Active account required', life: 10000 })
    return false
  }
  if (!form.title.trim()) {
    toast.add({ severity: 'warn', summary: 'Title required', life: 10000 })
    return false
  }
  if (!form.transactionDate) {
    toast.add({ severity: 'warn', summary: 'Date required', life: 10000 })
    return false
  }
  if (Number(form.amount) <= 0) {
    toast.add({ severity: 'warn', summary: 'Enter a positive amount', life: 10000 })
    return false
  }
  if (periodLocked.value) {
    toast.add({
      severity: 'error',
      summary: 'Period locked',
      detail: 'Choose an open billing period before saving this transaction.',
      life: 10000,
    })
    return false
  }
  if (requiresAttachment.value && !attachment.value && !hasExistingAttachment.value) {
    toast.add({
      severity: submitForPosting ? 'error' : 'warn',
      summary: 'Attachment missing',
      detail: submitForPosting
        ? 'This expense requires an invoice before saving.'
        : 'Draft saved without an invoice will remain visibly incomplete.',
      life: 10000,
    })
    if (submitForPosting) return false
  }
  if (
    Number(props.policy.highValueThreshold) > 0 &&
    Number(form.amount) >= Number(props.policy.highValueThreshold) &&
    submitForPosting &&
    !highValueConfirmed.value
  ) {
    highValueConfirmed.value = true
    toast.add({
      severity: 'warn',
      summary: 'High value confirmation',
      detail: 'Review the amount and click Save again to confirm.',
      life: 10000,
    })
    return false
  }

  return true
}

const submit = async (submitForPosting: boolean) => {
  if (!validate(submitForPosting)) return

  saving.value = true
  try {
    const body = {
      transactionType: form.transactionType,
      categoryId: form.categoryId,
      bankAccountId: form.bankAccountId,
      billingPeriodId: form.billingPeriodId || null,
      title: form.title.trim(),
      description: descriptionWithMetadata.value || null,
      counterpartyName: form.counterpartyName || null,
      voucherNumber: form.voucherNumber || null,
      transactionDate: form.transactionDate,
      amount: form.amount,
      ...(!isEditing.value ? { submitForPosting } : {}),
    }
    const response = await api<SaveResponse>(
      isEditing.value
        ? `/api/admin/finance/transactions/${props.transaction?.id}`
        : '/api/admin/finance/transactions',
      {
        method: isEditing.value ? 'PATCH' : 'POST',
        body,
      },
    )

    if (import.meta.client) {
      const storageKey =
        form.transactionType === 'EXPENSE'
          ? 'finance:lastPaidFromAccountId'
          : 'finance:lastReceivingAccountId'
      localStorage.setItem(storageKey, form.bankAccountId)
    }

    let attachmentUploaded = false
    if (attachment.value) {
      try {
        await uploadAttachment(response.data.id, attachment.value.file, null, {
          showErrorToast: false,
        })
        attachmentUploaded = true
      } catch (error) {
        const attachmentError = getApiErrorMessage(
          error,
          'The entry was saved, but the attachment could not be uploaded.',
        )
        toast.add({
          severity: 'error',
          summary: 'Attachment upload failed',
          detail: `Entry saved. ${attachmentError}`,
          life: 15000,
        })

        if (!isEditing.value) {
          emit('created', {
            id: response.data.id,
            status: response.data.status,
            attachmentUploaded: false,
            attachmentError,
          })
        }

        return
      }
    }

    const payload = {
      id: response.data.id,
      status: response.data.status,
      attachmentUploaded,
    }

    if (isEditing.value) {
      emit('updated', payload)
    } else {
      emit('created', payload)
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="finance-entry-layout" @submit.prevent="submit(true)">
    <section class="surface-card admin-form-section finance-entry-form">
      <div class="admin-form-section__header">
        <div>
          <p class="eyebrow">Simple entry</p>
          <h1>
            {{
              isEditing
                ? form.transactionType === 'EXPENSE'
                  ? 'Edit expense'
                  : 'Edit income'
                : form.transactionType === 'EXPENSE'
                  ? 'Add expense'
                  : 'Add income'
            }}
          </h1>
        </div>
        <TransactionTypeToggle v-model="form.transactionType" />
      </div>

      <Message v-if="duplicateWarnings.length" severity="warn" :closable="false">
        Similar transaction found for this counterparty, amount, date, or reference.
      </Message>

      <div class="admin-form-grid">
        <label>
          <span class="field-label">Category</span>
          <FinanceCategorySelect
            v-model="form.categoryId"
            :categories="categories"
            :transaction-type="form.transactionType"
          />
        </label>
        <label>
          <span class="field-label">
            {{ form.transactionType === 'EXPENSE' ? 'Paid-from account' : 'Receiving account' }}
          </span>
          <FinanceAccountSelect
            v-model="form.bankAccountId"
            :accounts="bankAccounts"
          />
        </label>
        <label>
          <span class="field-label">Date</span>
          <InputText v-model="form.transactionDate" type="date" required />
        </label>
        <label>
          <span class="field-label">Amount</span>
          <InputNumber
            v-model="form.amount"
            mode="currency"
            currency="INR"
            locale="en-IN"
            :min="0"
            required
          />
        </label>
        <label>
          <span class="field-label">Title</span>
          <InputText v-model="form.title" required />
        </label>
        <label>
          <span class="field-label">
            {{ form.transactionType === 'EXPENSE' ? 'Vendor' : 'Source / payer' }}
          </span>
          <InputText v-model="form.counterpartyName" />
        </label>
        <label>
          <span class="field-label">
            {{ form.transactionType === 'EXPENSE' ? 'Invoice number' : 'Reference' }}
          </span>
          <InputText v-model="form.voucherNumber" />
        </label>
        <label>
          <span class="field-label">Mode</span>
          <Select
            v-model="form.mode"
            :options="paymentModes"
            option-label="label"
            option-value="value"
          />
        </label>
        <label class="admin-form-grid__full">
          <span class="field-label">Notes</span>
          <Textarea v-model="form.description" rows="3" auto-resize />
        </label>
      </div>
    </section>

    <aside class="finance-entry-side">
      <AttachmentUploadCard
        :attachment="attachment"
        :required="requiresAttachment"
        @selected="setAttachment"
        @remove="clearAttachment"
      />
      <TransactionSummaryCard
        :transaction-type="form.transactionType"
        :amount="form.amount"
        :category="selectedCategory"
        :account-name="selectedAccount?.accountName ?? null"
        :billing-period-label="null"
        :attachment-present="Boolean(attachment) || hasExistingAttachment"
        :high-value-threshold="policy.highValueThreshold"
      />
      <TransactionActionBar
        form-mode
        :saving="saving"
        @submit-for-review="submit(true)"
      />
    </aside>
  </form>
</template>
