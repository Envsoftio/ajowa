<script setup lang="ts">
import type { ReconciliationAccount } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Finance Reconciliation',
})

type ReconciliationResponse = {
  ok: true
  data: {
    accounts: ReconciliationAccount[]
    health: {
      unbalancedPosted: number
      transactionsWithoutJournal: number
      paymentsWithoutJournal: number
    }
  }
}

const api = useApi()
const { data, pending, refresh } = await useAsyncData(
  'admin-finance-reconciliation',
  () => api<ReconciliationResponse>('/api/admin/finance/reconciliation'),
)

const accounts = computed(() => data.value?.data.accounts ?? [])
const health = computed(
  () =>
    data.value?.data.health ?? {
      unbalancedPosted: 0,
      transactionsWithoutJournal: 0,
      paymentsWithoutJournal: 0,
    },
)
const totalDebit = computed(() =>
  accounts.value.reduce((sum, account) => sum + account.debitTotal, 0),
)
const totalCredit = computed(() =>
  accounts.value.reduce((sum, account) => sum + account.creditTotal, 0),
)

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    value,
  )
</script>

<template>
  <div class="landing-page">
    <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Posted debits</p>
        <h3>{{ formatMoney(totalDebit) }}</h3>
        <p>All posted journal debit lines.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Posted credits</p>
        <h3>{{ formatMoney(totalCredit) }}</h3>
        <p>All posted journal credit lines.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Exceptions</p>
        <h3>
          {{
            health.unbalancedPosted +
            health.transactionsWithoutJournal +
            health.paymentsWithoutJournal
          }}
        </h3>
        <p>
          Unbalanced journals or posted source records missing journal links.
        </p>
      </section>
    </div>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Finance reconciliation</h1>
          <p>
            Compare account balances against posted journal lines and surface
            operational exceptions.
          </p>
        </div>
        <Button
          label="Refresh"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          title="Reload reconciliation totals and exception counts"
          @click="() => refresh()"
        />
      </header>

      <div class="admin-page-guide">
        <h2>How to use this page</h2>
        <p>
          Use reconciliation before period close to confirm that posted journals
          and source records agree.
        </p>
        <ol>
          <li>
            Debits and credits should balance across posted journal lines.
          </li>
          <li>
            Review exceptions before closing a period or presenting finance
            reports.
          </li>
          <li>
            Use the account table to identify which ledger heads carry the
            current balances.
          </li>
        </ol>
      </div>

      <div class="surface-grid">
        <section class="surface-card">
          <p class="eyebrow">Unbalanced posted journals</p>
          <h3>{{ health.unbalancedPosted }}</h3>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Transactions missing journals</p>
          <h3>{{ health.transactionsWithoutJournal }}</h3>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Payments missing journals</p>
          <h3>{{ health.paymentsWithoutJournal }}</h3>
        </section>
      </div>

      <AppDataTable
        :value="accounts"
        :loading="pending"
        responsive-layout="scroll"
        class="list-page__table"
      >
        <Column field="code" header="Code" />
        <Column field="name" header="Account" />
        <Column field="headType" header="Type" />
        <Column field="debitTotal" header="Debits">
          <template #body="{ data: row }">
            {{ formatMoney(row.debitTotal) }}
          </template>
        </Column>
        <Column field="creditTotal" header="Credits">
          <template #body="{ data: row }">
            {{ formatMoney(row.creditTotal) }}
          </template>
        </Column>
        <Column field="balance" header="Balance">
          <template #body="{ data: row }">
            {{ formatMoney(row.balance) }}
          </template>
        </Column>
      </AppDataTable>
    </section>
  </div>
</template>
