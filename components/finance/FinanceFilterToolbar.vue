<script setup lang="ts">
import type {
  BankAccount,
  BillingPeriod,
  FinanceCategory,
} from '~/types/domain'
import type { FinanceTransactionFilters } from '~/composables/useFinanceTransactionFilters'

const filters = defineModel<FinanceTransactionFilters>('filters', {
  required: true,
})

const props = defineProps<{
  categories: FinanceCategory[]
  accounts: BankAccount[]
  periods: BillingPeriod[]
  highValueThreshold: number
}>()

const emit = defineEmits<{
  quick: [key: string]
  reset: []
}>()

const typeOptions = [
  { label: 'All types', value: '' },
  { label: 'Expenses', value: 'EXPENSE' },
  { label: 'Income', value: 'INCOME' },
]

const statusOptions = [
  { label: 'All statuses', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Pending review', value: 'PENDING_REVIEW' },
  { label: 'Posted', value: 'POSTED' },
  { label: 'Returned', value: 'RETURNED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Reversed', value: 'REVERSED' },
]

const attachmentOptions = [
  { label: 'All attachments', value: '' },
  { label: 'Has attachment', value: 'present' },
  { label: 'Missing attachment', value: 'missing' },
]

const modeOptions = [
  { label: 'All modes', value: '' },
  { label: 'Cash', value: 'CASH' },
  { label: 'Bank transfer', value: 'BANK_TRANSFER' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Card', value: 'CARD' },
  { label: 'Other', value: 'OTHER' },
]

const categoryOptions = computed(() => [
  { label: 'All categories', value: '' },
  ...props.categories.map((category) => ({
    label: `${category.categoryGroup} - ${category.name}`,
    value: category.id,
  })),
])
</script>

<template>
  <div class="finance-filter-toolbar">
    <div class="finance-quick-chips">
      <Button label="All" severity="secondary" outlined @click="emit('quick', 'all')" />
      <Button label="Expenses" severity="secondary" outlined @click="emit('quick', 'expenses')" />
      <Button label="Income" severity="secondary" outlined @click="emit('quick', 'income')" />
      <Button label="This Month" severity="secondary" outlined @click="emit('quick', 'this-month')" />
      <Button label="Pending Review" severity="secondary" outlined @click="emit('quick', 'pending')" />
      <Button label="Missing Attachment" severity="secondary" outlined @click="emit('quick', 'missing')" />
      <Button
        label="High Value"
        severity="secondary"
        outlined
        @click="emit('quick', 'high-value')"
      />
    </div>

    <div class="list-page__toolbar">
      <label class="list-page__search">
        <span class="field-label">Search</span>
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText
            v-model="filters.search"
            placeholder="Title, vendor/source, invoice, reference"
          />
        </IconField>
      </label>

      <div class="list-page__filters finance-filter-toolbar__grid">
        <label>
          <span class="field-label">Type</span>
          <Select
            v-model="filters.transactionType"
            :options="typeOptions"
            option-label="label"
            option-value="value"
          />
        </label>
        <label>
          <span class="field-label">Status</span>
          <Select
            v-model="filters.status"
            :options="statusOptions"
            option-label="label"
            option-value="value"
          />
        </label>
        <label>
          <span class="field-label">Category</span>
          <Select
            v-model="filters.categoryId"
            :options="categoryOptions"
            option-label="label"
            option-value="value"
            filter
          />
        </label>
        <label>
          <span class="field-label">Account</span>
          <Select
            v-model="filters.bankAccountId"
            :options="[
              { label: 'All accounts', value: '' },
              ...accounts.map((account) => ({
                label: account.accountName,
                value: account.id,
              })),
            ]"
            option-label="label"
            option-value="value"
            filter
          />
        </label>
        <label>
          <span class="field-label">Period</span>
          <Select
            v-model="filters.billingPeriodId"
            :options="[
              { label: 'All periods', value: '' },
              ...periods.map((period) => ({
                label: period.label,
                value: period.id,
              })),
            ]"
            option-label="label"
            option-value="value"
            filter
          />
        </label>
        <label>
          <span class="field-label">Attachment</span>
          <Select
            v-model="filters.attachment"
            :options="attachmentOptions"
            option-label="label"
            option-value="value"
          />
        </label>
        <label>
          <span class="field-label">From</span>
          <InputText v-model="filters.dateFrom" type="date" />
        </label>
        <label>
          <span class="field-label">To</span>
          <InputText v-model="filters.dateTo" type="date" />
        </label>
        <label>
          <span class="field-label">Min amount</span>
          <InputNumber v-model="filters.minAmount" mode="currency" currency="INR" locale="en-IN" />
        </label>
        <label>
          <span class="field-label">Max amount</span>
          <InputNumber v-model="filters.maxAmount" mode="currency" currency="INR" locale="en-IN" />
        </label>
        <label>
          <span class="field-label">Vendor/source</span>
          <InputText v-model="filters.counterparty" placeholder="Name" />
        </label>
        <label>
          <span class="field-label">Mode</span>
          <Select
            v-model="filters.mode"
            :options="modeOptions"
            option-label="label"
            option-value="value"
          />
        </label>
        <label>
          <span class="field-label">Invoice/reference</span>
          <InputText v-model="filters.voucherNumber" />
        </label>
        <label class="admin-toggle-card">
          <span class="field-label">High value only</span>
          <ToggleSwitch v-model="filters.highValueOnly" />
        </label>
        <Button
          type="button"
          label="Reset"
          icon="pi pi-filter-slash"
          severity="secondary"
          outlined
          @click="emit('reset')"
        />
      </div>
    </div>
  </div>
</template>
