<script setup lang="ts">
import type { FinanceCategory, FinanceTransactionType } from '~/types/domain'

const props = defineProps<{
  transactionType: FinanceTransactionType
  amount: number
  category?: FinanceCategory | null
  accountName?: string | null
  billingPeriodLabel?: string | null
  status?: string | null
  attachmentPresent?: boolean
  highValueThreshold?: number
}>()

const { formatMoney } = useFinanceFormatters()

const isHighValue = computed(
  () =>
    Number(props.highValueThreshold ?? 0) > 0 &&
    Number(props.amount ?? 0) >= Number(props.highValueThreshold ?? 0),
)
</script>

<template>
  <section class="finance-summary-card">
    <div class="finance-summary-card__amount">
      <span>{{ transactionType === 'EXPENSE' ? 'Expense' : 'Income' }}</span>
      <strong>{{ formatMoney(amount) }}</strong>
    </div>
    <dl>
      <div>
        <dt>Category</dt>
        <dd>{{ category?.name ?? '-' }}</dd>
      </div>
      <div>
        <dt>Account</dt>
        <dd>{{ accountName ?? '-' }}</dd>
      </div>
      <div>
        <dt>Period</dt>
        <dd>{{ billingPeriodLabel ?? 'Not allocated' }}</dd>
      </div>
      <div>
        <dt>Attachment</dt>
        <dd>{{ attachmentPresent ? 'Ready' : 'Missing' }}</dd>
      </div>
    </dl>
    <div class="admin-inline-actions">
      <StatusTag v-if="status" :status="status" />
      <Tag v-if="isHighValue" value="High value" severity="warn" rounded />
    </div>
  </section>
</template>
