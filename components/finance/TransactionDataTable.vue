<script setup lang="ts">
import type { FinanceTransaction } from '~/types/domain'

defineProps<{
  transactions: FinanceTransaction[]
  loading?: boolean
  rows: number
  totalRecords: number
}>()

const emit = defineEmits([
  'page',
  'sort',
])

const { formatMoney, formatDate } = useFinanceFormatters()

const transactionDetailPath = (row: FinanceTransaction) =>
  row.detailPath === undefined
    ? `/admin/finance/transactions/${row.id}`
    : row.detailPath
</script>

<template>
  <EmptyFinanceState v-if="!loading && transactions.length === 0" />

  <AppDataTable
    v-else
    :value="transactions"
    :loading="loading"
    :paginator="true"
    :rows="rows"
    :total-records="totalRecords"
    lazy
    responsive-layout="scroll"
    class="list-page__table"
    sort-mode="single"
    @page="emit('page', $event)"
    @sort="emit('sort', $event)"
  >
    <Column field="transactionDate" header="Date" sortable>
      <template #body="{ data: row }">
        {{ formatDate(row.transactionDate) }}
      </template>
    </Column>
    <Column field="title" header="Transaction" sortable>
      <template #body="{ data: row }">
        <NuxtLink v-if="transactionDetailPath(row)" :to="transactionDetailPath(row)!" class="auth-inline-link">
          {{ row.title }}
        </NuxtLink>
        <span v-else>{{ row.title }}</span>
        <div class="muted-line">{{ row.voucherNumber || '-' }}</div>
      </template>
    </Column>
    <Column field="transactionType" header="Type" sortable />
    <Column field="categoryName" header="Category" sortable />
    <Column field="counterpartyName" header="Vendor/source" />
    <Column field="bankAccountName" header="Account" />
    <Column field="amount" header="Amount" sortable>
      <template #body="{ data: row }">
        {{ formatMoney(row.amount) }}
      </template>
    </Column>
    <Column header="Payment">
      <template #body="{ data: row }">
        <Tag
          v-if="row.transactionType === 'EXPENSE'"
          :value="row.expensePaymentCount ? 'Recorded' : 'Pending record'"
          :severity="row.expensePaymentCount ? 'success' : 'warn'"
          rounded
        />
        <span v-else class="muted-line">-</span>
        <div v-if="row.latestExpensePaymentDate" class="muted-line">
          {{ formatDate(row.latestExpensePaymentDate) }}
        </div>
      </template>
    </Column>
    <Column field="status" header="Status" sortable>
      <template #body="{ data: row }">
        <StatusTag :status="row.status" />
      </template>
    </Column>
    <Column field="attachmentCount" header="Attachment">
      <template #body="{ data: row }">
        <Tag
          :value="row.hasAttachments ? `${row.attachmentCount} file` : 'Missing'"
          :severity="row.hasAttachments ? 'success' : row.attachmentRequired ? 'danger' : 'secondary'"
          rounded
        />
      </template>
    </Column>
    <Column header="Actions" style="width: 80px">
      <template #body="{ data: row }">
        <div v-if="transactionDetailPath(row)" class="admin-inline-actions" style="gap: 0.15rem">
          <Button
            as="router-link"
            :to="transactionDetailPath(row)!"
            icon="pi pi-eye"
            text
            rounded
            severity="secondary"
            :aria-label="`View ${row.title}`"
            :title="`View ${row.title}`"
          />
        </div>
      </template>
    </Column>
  </AppDataTable>

  <div class="list-page__cards">
    <article v-for="row in transactions" :key="row.id" class="list-card">
      <div class="list-card__row">
        <span>Transaction</span>
        <NuxtLink v-if="transactionDetailPath(row)" :to="transactionDetailPath(row)!" class="auth-inline-link">
          {{ row.title }}
        </NuxtLink>
        <strong v-else>{{ row.title }}</strong>
      </div>
      <div class="list-card__row">
        <span>Date</span>
        <strong>{{ formatDate(row.transactionDate) }}</strong>
      </div>
      <div class="list-card__row">
        <span>Amount</span>
        <strong>{{ formatMoney(row.amount) }}</strong>
      </div>
      <div v-if="row.transactionType === 'EXPENSE'" class="list-card__row">
        <span>Payment</span>
        <Tag
          :value="row.expensePaymentCount ? 'Recorded' : 'Pending record'"
          :severity="row.expensePaymentCount ? 'success' : 'warn'"
          rounded
        />
      </div>
      <div class="list-card__row">
        <span>Status</span>
        <StatusTag :status="row.status" />
      </div>
    </article>
  </div>
</template>
