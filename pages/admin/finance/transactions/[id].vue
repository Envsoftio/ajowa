<script setup lang="ts">
import type { FinanceTransactionDetail } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Finance Transaction Detail',
})

type DetailResponse = { ok: true; data: FinanceTransactionDetail }

const route = useRoute()
const api = useApi()
const toast = useToast()
const confirmAction = useAppConfirm()
const { reasonDialog, requestReason, acceptReason, cancelReason } = useAppReasonDialog()
const { formatMoney, formatDate, formatDateTime } = useFinanceFormatters()

const {
  data,
  pending,
  refresh,
} = await useAsyncData(`finance-transaction-${route.params.id}`, () =>
  api<DetailResponse>(`/api/admin/finance/transactions/${route.params.id}`),
)

const detail = computed(() => data.value?.data ?? null)
const transaction = computed(() => detail.value?.transaction ?? null)

const approve = async () => {
  if (!transaction.value) return
  const confirmed = await confirmAction({
    header: 'Approve transaction?',
    message: `Approve and post ${transaction.value.title}? This will create journal entries.`,
    icon: 'pi pi-check-circle',
    acceptLabel: 'Approve',
    acceptSeverity: 'success',
  })

  if (!confirmed) {
    return
  }

  await api(`/api/admin/finance/transactions/${transaction.value.id}/approve`, {
    method: 'POST',
  })
  toast.add({ severity: 'success', summary: 'Posted', life: 10000 })
  await refresh()
}

const reject = async (returnForCorrection = false) => {
  if (!transaction.value) return
  const reason = await requestReason({
    header: returnForCorrection ? 'Return transaction?' : 'Reject transaction?',
    message: returnForCorrection
      ? `Add a reason for returning ${transaction.value.title}.`
      : `Add a reason for rejecting ${transaction.value.title}.`,
    acceptLabel: returnForCorrection ? 'Return' : 'Reject',
    acceptSeverity: returnForCorrection ? 'warn' : 'danger',
  })

  if (!reason) return
  await api(`/api/admin/finance/transactions/${transaction.value.id}/reject`, {
    method: 'POST',
    body: { reason, returnForCorrection },
  })
  toast.add({ severity: 'success', summary: 'Updated', life: 10000 })
  await refresh()
}

const reverse = async () => {
  if (!transaction.value) return
  const reason = await requestReason({
    header: 'Reverse transaction?',
    message: `Add a reason for reversing ${transaction.value.title}. A counter-entry journal will be posted.`,
    acceptLabel: 'Reverse',
    acceptSeverity: 'danger',
  })

  if (!reason) return
  await api(`/api/admin/finance/transactions/${transaction.value.id}/reverse`, {
    method: 'POST',
    body: { reason },
  })
  toast.add({ severity: 'success', summary: 'Reversed', life: 10000 })
  await refresh()
}
</script>

<template>
  <div class="landing-page">
    <AppState
      v-if="pending"
      variant="loading"
      title="Loading transaction"
      message="Preparing the finance entry details."
    />
    <EmptyFinanceState
      v-else-if="!detail || !transaction"
      title="Transaction not found"
      message="The requested finance entry could not be loaded."
    />
    <template v-else>
      <section class="surface-card list-page">
        <header class="list-page__header">
          <div>
            <p class="eyebrow">{{ transaction.transactionType }}</p>
            <h1>{{ transaction.title }}</h1>
            <p>{{ transaction.counterpartyName || 'No vendor/source recorded' }}</p>
          </div>
          <TransactionActionBar
            :transaction="transaction"
            @approve="approve"
            @return="reject(true)"
            @reject="reject(false)"
            @reverse="reverse"
          />
        </header>
      </section>

      <div class="surface-grid">
        <section class="surface-card">
          <p class="eyebrow">Amount</p>
          <h3>{{ formatMoney(transaction.amount) }}</h3>
          <p>{{ formatDate(transaction.transactionDate) }}</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Status</p>
          <h3><StatusTag :status="transaction.status" /></h3>
          <p>{{ transaction.journalVoucherNumber || 'No posted journal yet' }}</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Attachment</p>
          <h3>{{ detail.attachments.length }}</h3>
          <p v-if="transaction.attachmentRequired && !transaction.hasAttachments">
            Required document missing.
          </p>
          <p v-else>Attachment history retained.</p>
        </section>
      </div>

      <div class="admin-two-column admin-two-column--wide">
        <section class="surface-card admin-form-section">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Posting</p>
              <h2>Account and journal details</h2>
            </div>
          </div>
          <dl class="finance-detail-grid">
            <div>
              <dt>Category</dt>
              <dd>{{ transaction.categoryGroup }} - {{ transaction.categoryName }}</dd>
            </div>
            <div>
              <dt>Bank/cash account</dt>
              <dd>{{ transaction.bankAccountName || '-' }}</dd>
            </div>
            <div>
              <dt>Billing period</dt>
              <dd>{{ transaction.billingPeriodLabel || 'Not allocated' }}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{{ transaction.voucherNumber || '-' }}</dd>
            </div>
            <div>
              <dt>Created by</dt>
              <dd>{{ transaction.createdByName || '-' }}</dd>
            </div>
            <div>
              <dt>Posted at</dt>
              <dd>{{ formatDateTime(transaction.postedAt) }}</dd>
            </div>
          </dl>

          <Message
            v-if="transaction.status === 'POSTED' && !transaction.journalVoucherNumber"
            severity="error"
            :closable="false"
          >
            Posted transaction has no journal voucher linked.
          </Message>

          <Message
            v-if="detail.linkedEntries.reversingVoucherNumber"
            severity="warn"
            :closable="false"
          >
            Reversed by {{ detail.linkedEntries.reversingVoucherNumber }}.
          </Message>

          <AppDataTable
            v-for="journal in detail.journals"
            :key="journal.id"
            :value="journal.lines"
            responsive-layout="scroll"
            class="list-page__table"
          >
            <template #header>
              <strong>{{ journal.voucherNumber }}</strong>
            </template>
            <Column field="lineNo" header="#" />
            <Column field="accountHeadName" header="Account">
              <template #body="{ data: row }">
                {{ row.accountHeadCode }} - {{ row.accountHeadName }}
              </template>
            </Column>
            <Column field="lineType" header="Type" />
            <Column field="amount" header="Amount">
              <template #body="{ data: row }">{{ formatMoney(row.amount) }}</template>
            </Column>
          </AppDataTable>
        </section>

        <aside class="admin-form-layout">
          <section class="surface-card admin-form-section">
            <div class="admin-form-section__header">
              <div>
                <p class="eyebrow">Documents</p>
                <h2>Attachment preview</h2>
              </div>
            </div>
            <Message
              v-if="transaction.attachmentRequired && !detail.attachments.length"
              severity="error"
              :closable="false"
            >
              Required attachment missing.
            </Message>
            <AttachmentPreview
              v-for="attachment in detail.attachments"
              :key="attachment.id"
              :attachment="attachment"
              :transaction-id="transaction.id"
            />
            <EmptyFinanceState
              v-if="detail.attachments.length === 0"
              title="No attachments"
              message="No finance document is linked to this transaction."
            />
          </section>

          <section class="surface-card admin-form-section">
            <div class="admin-form-section__header">
              <div>
                <p class="eyebrow">Audit</p>
                <h2>Timeline</h2>
              </div>
            </div>
            <FinanceAuditTimeline :events="detail.auditEvents" />
          </section>
        </aside>
      </div>
    </template>

    <AppReasonDialog
      v-model:visible="reasonDialog.visible"
      v-model:reason="reasonDialog.reason"
      :header="reasonDialog.header"
      :message="reasonDialog.message"
      :accept-label="reasonDialog.acceptLabel"
      :accept-severity="reasonDialog.acceptSeverity"
      :placeholder="reasonDialog.placeholder"
      @accept="acceptReason"
      @cancel="cancelReason"
    />
  </div>
</template>
