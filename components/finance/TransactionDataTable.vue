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
  'approve',
  'returnForCorrection',
  'reject',
  'reverse',
])

const { formatMoney, formatDate } = useFinanceFormatters()
</script>

<template>
  <EmptyFinanceState v-if="!loading && transactions.length === 0" />

  <DataTable
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
        <NuxtLink :to="`/admin/finance/transactions/${row.id}`" class="auth-inline-link">
          {{ row.title }}
        </NuxtLink>
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
    <Column field="journalVoucherNumber" header="Journal" />
    <Column header="Actions" style="width: 230px">
      <template #body="{ data: row }">
        <div class="admin-inline-actions" style="gap: 0.15rem">
          <Button
            as="router-link"
            :to="`/admin/finance/transactions/${row.id}`"
            icon="pi pi-eye"
            text
            rounded
            severity="secondary"
            :aria-label="`View ${row.title}`"
            :title="`View ${row.title}`"
          />
          <Button
            v-if="['DRAFT', 'PENDING_REVIEW', 'RETURNED'].includes(row.status)"
            icon="pi pi-check"
            severity="success"
            text
            rounded
            :aria-label="`Approve ${row.title}`"
            :title="`Approve ${row.title}`"
            @click="emit('approve', row)"
          />
          <Button
            v-if="['DRAFT', 'PENDING_REVIEW', 'RETURNED'].includes(row.status)"
            icon="pi pi-replay"
            severity="secondary"
            text
            rounded
            :aria-label="`Return ${row.title}`"
            :title="`Return ${row.title}`"
            @click="emit('returnForCorrection', row)"
          />
          <Button
            v-if="['DRAFT', 'PENDING_REVIEW', 'RETURNED'].includes(row.status)"
            icon="pi pi-times"
            severity="danger"
            text
            rounded
            :aria-label="`Reject ${row.title}`"
            :title="`Reject ${row.title}`"
            @click="emit('reject', row)"
          />
          <Button
            v-if="row.status === 'POSTED'"
            icon="pi pi-undo"
            severity="danger"
            text
            rounded
            :aria-label="`Reverse ${row.title}`"
            :title="`Reverse ${row.title}`"
            @click="emit('reverse', row)"
          />
        </div>
      </template>
    </Column>
  </DataTable>

  <div class="list-page__cards">
    <article v-for="row in transactions" :key="row.id" class="list-card">
      <div class="list-card__row">
        <span>Transaction</span>
        <NuxtLink :to="`/admin/finance/transactions/${row.id}`" class="auth-inline-link">
          {{ row.title }}
        </NuxtLink>
      </div>
      <div class="list-card__row">
        <span>Date</span>
        <strong>{{ formatDate(row.transactionDate) }}</strong>
      </div>
      <div class="list-card__row">
        <span>Amount</span>
        <strong>{{ formatMoney(row.amount) }}</strong>
      </div>
      <div class="list-card__row">
        <span>Status</span>
        <StatusTag :status="row.status" />
      </div>
    </article>
  </div>
</template>
