import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { createPrivateSignedUrl } from '~/server/utils/storage'
import type {
  FinanceAuditEvent,
  FinanceExpensePayment,
  FinanceJournalEntry,
  FinanceJournalLine,
  FinanceTransaction,
  FinanceTransactionAttachment,
  FinanceTransactionDetail,
} from '~/types/domain'

type TransactionRow = {
  id: string
  society_id: string
  transaction_type: FinanceTransaction['transactionType']
  category_id: string
  category_name: string
  category_group: string
  attachment_required: boolean
  bank_account_id: string | null
  bank_account_name: string | null
  billing_period_id: string | null
  billing_period_label: string | null
  title: string
  description: string | null
  counterparty_name: string | null
  voucher_number: string | null
  transaction_date: string
  amount: string
  status: FinanceTransaction['status']
  journal_voucher_number: string | null
  expense_payment_count: string
  expense_payment_total: string
  latest_expense_payment_date: string | null
  attachment_count: string
  created_by_name: string | null
  approved_by_name: string | null
  approved_at: string | null
  posted_at: string | null
  reversed_at: string | null
  created_at: string
  updated_at: string
}

type AttachmentRow = {
  id: string
  transaction_id: string
  file_name: string
  file_path: string
  mime_type: string
  size_bytes: number
  checksum: string | null
  uploaded_by_user_id: string | null
  uploaded_by_name: string | null
  replaces_attachment_id: string | null
  replaced_at: string | null
  created_at: string
}

type ExpensePaymentRow = {
  id: string
  society_id: string
  transaction_id: string
  bank_account_id: string
  bank_account_name: string | null
  payment_date: string
  amount: string
  mode: FinanceExpensePayment['mode']
  reference_number: string | null
  notes: string | null
  journal_voucher_number: string | null
  created_by_user_id: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

type JournalRow = {
  id: string
  society_id: string
  voucher_number: string
  transaction_id: string | null
  payment_id: string | null
  billing_period_id: string | null
  billing_period_label: string | null
  entry_date: string
  description: string | null
  status: FinanceJournalEntry['status']
  posted_by_user_id: string | null
  posted_by_name: string | null
  posted_at: string | null
  reversal_of_entry_id: string | null
  created_at: string
  updated_at: string
}

type JournalLineRow = {
  id: string
  journal_entry_id: string
  line_no: number
  account_head_id: string
  account_head_code: string
  account_head_name: string
  line_type: FinanceJournalLine['lineType']
  amount: string
  description: string | null
}

type AuditRow = {
  id: string
  event_key: string
  action: string
  severity: string
  actor_name: string | null
  metadata: Record<string, unknown>
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  occurred_at: string
}

const mapTransaction = (row: TransactionRow): FinanceTransaction => ({
  id: row.id,
  societyId: row.society_id,
  transactionType: row.transaction_type,
  categoryId: row.category_id,
  categoryName: row.category_name,
  categoryGroup: row.category_group,
  bankAccountId: row.bank_account_id,
  bankAccountName: row.bank_account_name,
  billingPeriodId: row.billing_period_id,
  billingPeriodLabel: row.billing_period_label,
  title: row.title,
  description: row.description,
  counterpartyName: row.counterparty_name,
  voucherNumber: row.voucher_number,
  transactionDate: row.transaction_date,
  amount: Number(row.amount),
  status: row.status,
  journalVoucherNumber: row.journal_voucher_number,
  expensePaymentCount: Number(row.expense_payment_count ?? 0),
  expensePaymentTotal: Number(row.expense_payment_total ?? 0),
  latestExpensePaymentDate: row.latest_expense_payment_date,
  attachmentCount: Number(row.attachment_count ?? 0),
  hasAttachments: Number(row.attachment_count ?? 0) > 0,
  attachmentRequired: row.attachment_required,
  createdByName: row.created_by_name,
  approvedByName: row.approved_by_name,
  approvedAt: row.approved_at,
  postedAt: row.posted_at,
  reversedAt: row.reversed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapExpensePayment = (row: ExpensePaymentRow): FinanceExpensePayment => ({
  id: row.id,
  societyId: row.society_id,
  transactionId: row.transaction_id,
  bankAccountId: row.bank_account_id,
  bankAccountName: row.bank_account_name,
  paymentDate: row.payment_date,
  amount: Number(row.amount),
  mode: row.mode,
  referenceNumber: row.reference_number,
  notes: row.notes,
  journalVoucherNumber: row.journal_voucher_number,
  createdByUserId: row.created_by_user_id,
  createdByName: row.created_by_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = String(event.context.params?.id ?? '')
  const pool = getDatabasePool()

  const transactionResult = await pool.query<TransactionRow>(
    `
      select
        t.id,
        t.society_id,
        t.transaction_type::text,
        t.category_id,
        tc.name as category_name,
        tc.category_group,
        tc.requires_attachment as attachment_required,
        t.bank_account_id,
        ba.account_name as bank_account_name,
        t.billing_period_id,
        bp.label as billing_period_label,
        t.title,
        t.description,
        t.counterparty_name,
        t.voucher_number,
        t.transaction_date::text,
        t.amount::text,
        t.status::text,
        je.voucher_number as journal_voucher_number,
        coalesce(ep_counts.payment_count, 0)::text as expense_payment_count,
        coalesce(ep_counts.payment_total, 0)::text as expense_payment_total,
        ep_counts.latest_payment_date::text as latest_expense_payment_date,
        coalesce(ta_counts.attachment_count, 0)::text as attachment_count,
        creator.full_name as created_by_name,
        approver.full_name as approved_by_name,
        t.approved_at::text,
        t.posted_at::text,
        t.reversed_at::text,
        t.created_at::text,
        t.updated_at::text
      from transactions t
      join transaction_categories tc on tc.id = t.category_id
      left join society_bank_accounts ba on ba.id = t.bank_account_id
      left join billing_periods bp on bp.id = t.billing_period_id
      left join journal_entries je on je.transaction_id = t.id and je.status = 'POSTED'
      left join (
        select
          transaction_id,
          count(*)::int as payment_count,
          coalesce(sum(amount), 0) as payment_total,
          max(payment_date) as latest_payment_date
        from expense_payments
        group by transaction_id
      ) ep_counts on ep_counts.transaction_id = t.id
      left join (
        select transaction_id, count(*)::int as attachment_count
        from transaction_attachments
        where replaced_at is null
        group by transaction_id
      ) ta_counts on ta_counts.transaction_id = t.id
      left join users creator on creator.id = t.created_by_user_id
      left join users approver on approver.id = t.approved_by_user_id
      where t.id = $1 and t.society_id = $2
      limit 1
    `,
    [id, authMe.user.societyId],
  )

  const row = transactionResult.rows[0]
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Transaction not found.' })
  }

  const [expensePaymentResult, attachmentResult, journalResult, lineResult, auditResult, reversalResult] =
    await Promise.all([
      pool.query<ExpensePaymentRow>(
        `
          select
            ep.id,
            ep.society_id,
            ep.transaction_id,
            ep.bank_account_id,
            ba.account_name as bank_account_name,
            ep.payment_date::text,
            ep.amount::text,
            ep.mode,
            ep.reference_number,
            ep.notes,
            je.voucher_number as journal_voucher_number,
            ep.created_by_user_id,
            creator.full_name as created_by_name,
            ep.created_at::text,
            ep.updated_at::text
          from expense_payments ep
          left join society_bank_accounts ba on ba.id = ep.bank_account_id
          left join journal_entries je on je.expense_payment_id = ep.id and je.status = 'POSTED'
          left join users creator on creator.id = ep.created_by_user_id
          where ep.transaction_id = $1 and ep.society_id = $2
          order by ep.payment_date desc, ep.created_at desc
        `,
        [id, authMe.user.societyId],
      ),
      pool.query<AttachmentRow>(
        `
          select
            ta.id,
            ta.transaction_id,
            ta.file_name,
            ta.file_path,
            ta.mime_type,
            ta.size_bytes,
            ta.checksum,
            ta.uploaded_by_user_id,
            uploader.full_name as uploaded_by_name,
            ta.replaces_attachment_id,
            ta.replaced_at::text,
            ta.created_at::text
          from transaction_attachments ta
          left join users uploader on uploader.id = ta.uploaded_by_user_id
          where ta.transaction_id = $1
          order by ta.created_at desc
        `,
        [id],
      ),
      pool.query<JournalRow>(
        `
          select
            je.id,
            je.society_id,
            je.voucher_number,
            je.transaction_id,
            je.payment_id,
            je.billing_period_id,
            bp.label as billing_period_label,
            je.entry_date::text,
            je.description,
            je.status::text,
            je.posted_by_user_id,
            poster.full_name as posted_by_name,
            je.posted_at::text,
            je.reversal_of_entry_id,
            je.created_at::text,
            je.updated_at::text
          from journal_entries je
          left join billing_periods bp on bp.id = je.billing_period_id
          left join users poster on poster.id = je.posted_by_user_id
          where je.transaction_id = $1
          order by je.created_at asc
        `,
        [id],
      ),
      pool.query<JournalLineRow>(
        `
          select
            jl.id,
            jl.journal_entry_id,
            jl.line_no,
            jl.account_head_id,
            ah.code as account_head_code,
            ah.name as account_head_name,
            jl.line_type::text,
            jl.amount::text,
            jl.description
          from journal_lines jl
          join journal_entries je on je.id = jl.journal_entry_id
          join account_heads ah on ah.id = jl.account_head_id
          where je.transaction_id = $1
          order by jl.line_no asc
        `,
        [id],
      ),
      pool.query<AuditRow>(
        `
          select
            ae.id,
            ae.event_key,
            ae.action::text,
            ae.severity::text,
            actor.full_name as actor_name,
            ae.metadata,
            ae.before_state,
            ae.after_state,
            ae.occurred_at::text
          from audit_events ae
          join audit_event_entities aee on aee.audit_event_id = ae.id
          left join users actor on actor.id = ae.actor_user_id
          where aee.entity_table = 'transactions' and aee.entity_id = $1
          order by ae.occurred_at desc
        `,
        [id],
      ),
      pool.query<{ original_voucher_number: string | null; reversing_voucher_number: string | null }>(
        `
          select
            original.voucher_number as original_voucher_number,
            reversal.voucher_number as reversing_voucher_number
          from journal_entries original
          left join journal_entries reversal on reversal.reversal_of_entry_id = original.id
          where original.transaction_id = $1
          limit 1
        `,
        [id],
      ),
    ])

  const signedAttachments: FinanceTransactionAttachment[] = await Promise.all(
    attachmentResult.rows.map(async (attachment) => ({
      id: attachment.id,
      transactionId: attachment.transaction_id,
      fileName: attachment.file_name,
      filePath: attachment.file_path,
      mimeType: attachment.mime_type,
      sizeBytes: attachment.size_bytes,
      checksum: attachment.checksum,
      uploadedByUserId: attachment.uploaded_by_user_id,
      uploadedByName: attachment.uploaded_by_name,
      replacesAttachmentId: attachment.replaces_attachment_id,
      replacedAt: attachment.replaced_at,
      downloadUrl: await createPrivateSignedUrl({
        storageTargetKey: 'finance_attachments',
        storageObjectKey: attachment.file_path,
      }).catch(() => null),
      createdAt: attachment.created_at,
      updatedAt: attachment.created_at,
    })),
  )

  const linesByJournal = new Map<string, FinanceJournalLine[]>()
  for (const line of lineResult.rows) {
    const mapped: FinanceJournalLine = {
      id: line.id,
      journalEntryId: line.journal_entry_id,
      lineNo: line.line_no,
      accountHeadId: line.account_head_id,
      accountHeadCode: line.account_head_code,
      accountHeadName: line.account_head_name,
      lineType: line.line_type,
      amount: Number(line.amount),
      description: line.description,
    }
    linesByJournal.set(line.journal_entry_id, [
      ...(linesByJournal.get(line.journal_entry_id) ?? []),
      mapped,
    ])
  }

  const journals = journalResult.rows.map((journal) => ({
    id: journal.id,
    societyId: journal.society_id,
    voucherNumber: journal.voucher_number,
    transactionId: journal.transaction_id,
    paymentId: journal.payment_id,
    billingPeriodId: journal.billing_period_id,
    billingPeriodLabel: journal.billing_period_label,
    entryDate: journal.entry_date,
    description: journal.description,
    status: journal.status,
    postedByUserId: journal.posted_by_user_id,
    postedByName: journal.posted_by_name,
    postedAt: journal.posted_at,
    reversalOfEntryId: journal.reversal_of_entry_id,
    debitTotal: lineResult.rows
      .filter((line) => line.journal_entry_id === journal.id && line.line_type === 'DEBIT')
      .reduce((sum, line) => sum + Number(line.amount), 0),
    creditTotal: lineResult.rows
      .filter((line) => line.journal_entry_id === journal.id && line.line_type === 'CREDIT')
      .reduce((sum, line) => sum + Number(line.amount), 0),
    lineCount: linesByJournal.get(journal.id)?.length ?? 0,
    lines: linesByJournal.get(journal.id) ?? [],
    createdAt: journal.created_at,
    updatedAt: journal.updated_at,
  }))

  const detail: FinanceTransactionDetail = {
    transaction: mapTransaction(row),
    expensePayments: expensePaymentResult.rows.map(mapExpensePayment),
    attachments: signedAttachments,
    journals,
    auditEvents: auditResult.rows.map((audit): FinanceAuditEvent => ({
      id: audit.id,
      eventKey: audit.event_key,
      action: audit.action,
      severity: audit.severity,
      actorName: audit.actor_name,
      metadata: audit.metadata ?? {},
      beforeState: audit.before_state,
      afterState: audit.after_state,
      occurredAt: audit.occurred_at,
    })),
    linkedEntries: {
      originalVoucherNumber: reversalResult.rows[0]?.original_voucher_number ?? null,
      reversingVoucherNumber: reversalResult.rows[0]?.reversing_voucher_number ?? null,
    },
  }

  return createApiSuccess(event, detail)
})
