import type { H3Event } from 'h3'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { writeAuditEvent, resolveAuditSeverity } from './audit'
import type { AuditAction } from '~/shared/audit'
import type {
  AccountHead,
  BankAccount,
  FinanceCategory,
  FinanceJournalEntry,
  FinancialPeriodClose,
  ReconciliationAccount,
} from '~/types/domain'
import { AppError } from './errors'

export const accountHeadTypes = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY'] as const
export const bankAccountTypes = ['SAVINGS', 'CURRENT', 'CASH_CREDIT', 'OVERDRAFT', 'OTHER'] as const
export const transactionTypes = ['INCOME', 'EXPENSE'] as const
export const financeStatuses = ['DRAFT', 'PENDING_REVIEW', 'POSTED', 'REJECTED', 'RETURNED', 'REVERSED', 'CANCELLED'] as const

const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9._-]+$/i, 'Use letters, numbers, dots, underscores, or hyphens.')
  .transform((value) => value.toUpperCase())

export const accountHeadSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(2).max(160),
  parentId: z.string().uuid().nullable().optional(),
  headType: z.enum(accountHeadTypes),
  isActive: z.boolean().default(true),
  allowsManualEntries: z.boolean().default(true),
})

export const accountHeadUpdateSchema = accountHeadSchema.partial()

export const bankAccountSchema = z.object({
  bankName: z.string().trim().min(2).max(160),
  accountName: z.string().trim().min(2).max(160),
  accountNumber: z.string().trim().min(4).max(40),
  ifscCode: z
    .string()
    .trim()
    .min(4)
    .max(20)
    .transform((value) => value.toUpperCase()),
  accountType: z.enum(bankAccountTypes).default('CURRENT'),
  branchName: z.string().trim().max(160).nullable().optional(),
  upiId: z.string().trim().max(120).nullable().optional(),
  accountHeadId: z.string().uuid(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

export const bankAccountUpdateSchema = bankAccountSchema.partial()

export const categorySchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(2).max(160),
  transactionType: z.enum(transactionTypes),
  categoryGroup: z.string().trim().min(2).max(120),
  accountHeadId: z.string().uuid(),
  requiresAttachment: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

export const categoryUpdateSchema = z.object({
  code: codeSchema.optional(),
  name: z.string().trim().min(2).max(160).optional(),
  transactionType: z.enum(transactionTypes).optional(),
  categoryGroup: z.string().trim().min(2).max(120).optional(),
  accountHeadId: z.string().uuid().optional(),
  requiresAttachment: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export const transactionSchema = z.object({
  transactionType: z.enum(transactionTypes),
  categoryId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  billingPeriodId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1000).nullable().optional(),
  counterpartyName: z.string().trim().max(160).nullable().optional(),
  voucherNumber: z.string().trim().max(80).nullable().optional(),
  transactionDate: z.string().date(),
  amount: z.coerce.number().positive(),
  submitForPosting: z.boolean().default(true),
})

export const transactionUpdateSchema = transactionSchema.omit({ submitForPosting: true })

export const financeDecisionSchema = z.object({
  reason: z.string().trim().min(3).max(500),
})

export const financeRejectSchema = financeDecisionSchema.extend({
  returnForCorrection: z.boolean().default(false),
})

export const periodCloseSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  notes: z.string().trim().max(1000).nullable().optional(),
})

export type AccountHeadInput = z.infer<typeof accountHeadSchema>
export type AccountHeadUpdateInput = z.infer<typeof accountHeadUpdateSchema>
export type BankAccountInput = z.infer<typeof bankAccountSchema>
export type BankAccountUpdateInput = z.infer<typeof bankAccountUpdateSchema>
export type CategoryInput = z.infer<typeof categorySchema>
export type TransactionInput = z.infer<typeof transactionSchema>
export type TransactionUpdateInput = z.infer<typeof transactionUpdateSchema>

export type AccountHeadRow = {
  id: string
  society_id: string | null
  parent_id: string | null
  parent_name: string | null
  code: string
  name: string
  head_type: AccountHead['headType']
  is_system: boolean
  is_active: boolean
  allows_manual_entries: boolean
  created_at: string
  updated_at: string
  level: number
  has_children: boolean
  mapped_bank_account_count: string
  balance: string
}

export type BankAccountRow = {
  id: string
  society_id: string
  account_head_id: string
  account_head_code: string
  account_head_name: string
  bank_name: string
  account_name: string
  account_number: string
  ifsc_code: string
  account_type: BankAccount['accountType']
  branch_name: string | null
  upi_id: string | null
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  balance: string
}

export type CategoryRow = {
  id: string
  society_id: string | null
  code: string
  name: string
  transaction_type: FinanceCategory['transactionType']
  category_group: string
  account_head_id: string | null
  account_head_code: string | null
  account_head_name: string | null
  account_head_type: AccountHead['headType'] | null
  transaction_count: string
  requires_attachment: boolean
  is_system: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export type JournalEntryRow = {
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
  debits: string
  credits: string
  line_count: string
}

export type PeriodCloseRow = {
  id: string
  society_id: string
  start_date: string
  end_date: string
  notes: string | null
  opening_balance: string
  income_total: string
  expense_total: string
  closing_balance: string
  validation_snapshot: Record<string, unknown>
  closed_at: string
  closed_by_user_id: string | null
  closed_by_name: string | null
  is_reopened: boolean
  reopened_at: string | null
  reopened_by_user_id: string | null
  reopened_by_name: string | null
  reopen_reason: string | null
  created_at: string
  updated_at: string
}

export type ReconciliationAccountRow = {
  account_head_id: string
  code: string
  name: string
  head_type: AccountHead['headType']
  debit_total: string
  credit_total: string
  balance: string
}

export const mapAccountHeadRow = (row: AccountHeadRow): AccountHead => ({
  id: row.id,
  societyId: row.society_id,
  parentId: row.parent_id,
  parentName: row.parent_name,
  code: row.code,
  name: row.name,
  headType: row.head_type,
  isSystem: row.is_system,
  isActive: row.is_active,
  allowsManualEntries: row.allows_manual_entries,
  level: Number(row.level ?? 0),
  hasChildren: row.has_children,
  mappedBankAccountCount: Number(row.mapped_bank_account_count ?? 0),
  balance: Number(row.balance ?? 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const maskAccountNumber = (accountNumber: string) => {
  const compact = accountNumber.replace(/\s+/g, '')
  if (compact.length <= 4) {
    return compact
  }

  return `${'*'.repeat(Math.max(0, compact.length - 4))}${compact.slice(-4)}`
}

export const mapBankAccountRow = (row: BankAccountRow): BankAccount => ({
  id: row.id,
  societyId: row.society_id,
  accountHeadId: row.account_head_id,
  accountHeadCode: row.account_head_code,
  accountHeadName: row.account_head_name,
  bankName: row.bank_name,
  accountName: row.account_name,
  accountNumberMasked: maskAccountNumber(row.account_number),
  ifscCode: row.ifsc_code,
  accountType: row.account_type,
  branchName: row.branch_name,
  upiId: row.upi_id,
  isDefault: row.is_default,
  isActive: row.is_active,
  balance: Number(row.balance ?? 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapCategoryRow = (row: CategoryRow): FinanceCategory => ({
  id: row.id,
  societyId: row.society_id,
  code: row.code,
  name: row.name,
  transactionType: row.transaction_type,
  categoryGroup: row.category_group,
  accountHeadId: row.account_head_id,
  accountHeadCode: row.account_head_code,
  accountHeadName: row.account_head_name,
  accountHeadType: row.account_head_type,
  transactionCount: Number(row.transaction_count ?? 0),
  requiresAttachment: row.requires_attachment,
  isSystem: row.is_system,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapJournalEntryRow = (row: JournalEntryRow): FinanceJournalEntry => ({
  id: row.id,
  societyId: row.society_id,
  voucherNumber: row.voucher_number,
  transactionId: row.transaction_id,
  paymentId: row.payment_id,
  billingPeriodId: row.billing_period_id,
  billingPeriodLabel: row.billing_period_label,
  entryDate: row.entry_date,
  description: row.description,
  status: row.status,
  postedByUserId: row.posted_by_user_id,
  postedByName: row.posted_by_name,
  postedAt: row.posted_at,
  reversalOfEntryId: row.reversal_of_entry_id,
  debitTotal: Number(row.debits ?? 0),
  creditTotal: Number(row.credits ?? 0),
  lineCount: Number(row.line_count ?? 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapPeriodCloseRow = (row: PeriodCloseRow): FinancialPeriodClose => ({
  id: row.id,
  societyId: row.society_id,
  startDate: row.start_date,
  endDate: row.end_date,
  notes: row.notes,
  openingBalance: Number(row.opening_balance ?? 0),
  incomeTotal: Number(row.income_total ?? 0),
  expenseTotal: Number(row.expense_total ?? 0),
  closingBalance: Number(row.closing_balance ?? 0),
  validationSnapshot: row.validation_snapshot ?? {},
  closedAt: row.closed_at,
  closedByUserId: row.closed_by_user_id,
  closedByName: row.closed_by_name,
  isReopened: row.is_reopened,
  reopenedAt: row.reopened_at,
  reopenedByUserId: row.reopened_by_user_id,
  reopenedByName: row.reopened_by_name,
  reopenReason: row.reopen_reason,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapReconciliationAccountRow = (row: ReconciliationAccountRow): ReconciliationAccount => ({
  accountHeadId: row.account_head_id,
  code: row.code,
  name: row.name,
  headType: row.head_type,
  debitTotal: Number(row.debit_total ?? 0),
  creditTotal: Number(row.credit_total ?? 0),
  balance: Number(row.balance ?? 0),
})

const roundMoney = (value: number) => Math.round(value * 100) / 100

export const nextJournalVoucherNumber = async (client: PoolClient, dateValue: string) => {
  const year = new Date(`${dateValue}T00:00:00.000Z`).getUTCFullYear()
  const result = await client.query<{ value: string }>(
    `select next_yearly_sequence('JOURNAL_VOUCHER', $1)::text as value`,
    [year],
  )
  return `JV-${year}-${String(result.rows[0]?.value ?? '1').padStart(6, '0')}`
}

const assertNoClosedPeriodOverlap = async (
  client: PoolClient,
  societyId: string,
  startDate: string,
  endDate: string,
) => {
  const closed = await client.query<{ id: string }>(
    `
      select id
      from financial_period_close
      where society_id = $1
        and is_reopened = false
        and daterange(start_date, end_date, '[]') && daterange($2::date, $3::date, '[]')
      limit 1
    `,
    [societyId, startDate, endDate],
  )

  if (closed.rows[0]) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'This date range overlaps an already closed financial period.',
    })
  }
}

export const validateFinanceTransactionContext = async (
  client: PoolClient,
  societyId: string,
  input: { transactionType: 'INCOME' | 'EXPENSE'; categoryId: string; bankAccountId: string },
) => {
  const result = await client.query<{
    category_id: string
    category_name: string
    category_type: 'INCOME' | 'EXPENSE'
    category_active: boolean
    bank_account_id: string
    bank_account_name: string
    bank_active: boolean
  }>(
    `
      select
        tc.id as category_id,
        tc.name as category_name,
        tc.transaction_type::text as category_type,
        tc.is_active as category_active,
        ba.id as bank_account_id,
        ba.account_name as bank_account_name,
        ba.is_active as bank_active
      from transaction_categories tc
      cross join society_bank_accounts ba
      where tc.id = $2
        and (tc.society_id = $1 or tc.society_id is null)
        and ba.id = $3
        and ba.society_id = $1
      limit 1
    `,
    [societyId, input.categoryId, input.bankAccountId],
  )
  const row = result.rows[0]

  if (!row) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Category or bank account was not found.' })
  }
  if (row.category_type !== input.transactionType) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `${row.category_type.toLowerCase()} categories cannot be used for ${input.transactionType.toLowerCase()} transactions.`,
    })
  }
  if (!row.category_active) {
    throw new AppError({ code: 'CONFLICT', statusCode: 409, message: 'Inactive categories cannot be used.' })
  }
  if (!row.bank_active) {
    throw new AppError({ code: 'CONFLICT', statusCode: 409, message: 'Inactive bank or cash accounts cannot be used.' })
  }

  return row
}

const loadPostingContext = async (
  client: PoolClient,
  societyId: string,
  input: { transactionType: 'INCOME' | 'EXPENSE'; categoryId: string; bankAccountId: string },
) => {
  const result = await client.query<{
    category_id: string
    category_name: string
    category_type: 'INCOME' | 'EXPENSE'
    category_active: boolean
    posting_account_id: string | null
    posting_account_name: string | null
    posting_account_type: AccountHead['headType'] | null
    posting_account_active: boolean | null
    posting_allows_manual: boolean | null
    bank_account_id: string
    bank_account_name: string
    bank_active: boolean
    bank_account_head_id: string
  }>(
    `
      select
        tc.id as category_id,
        tc.name as category_name,
        tc.transaction_type::text as category_type,
        tc.is_active as category_active,
        tc.account_head_id as posting_account_id,
        ah.name as posting_account_name,
        ah.head_type::text as posting_account_type,
        ah.is_active as posting_account_active,
        ah.allows_manual_entries as posting_allows_manual,
        ba.id as bank_account_id,
        ba.account_name as bank_account_name,
        ba.is_active as bank_active,
        ba.account_head_id as bank_account_head_id
      from transaction_categories tc
      left join account_heads ah on ah.id = tc.account_head_id
      cross join society_bank_accounts ba
      where tc.id = $2
        and (tc.society_id = $1 or tc.society_id is null)
        and ba.id = $3
        and ba.society_id = $1
      limit 1
    `,
    [societyId, input.categoryId, input.bankAccountId],
  )
  const row = result.rows[0]

  if (!row) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Category or bank account was not found.' })
  }
  if (row.category_type !== input.transactionType) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `${row.category_type.toLowerCase()} categories cannot be used for ${input.transactionType.toLowerCase()} transactions.`,
    })
  }
  if (!row.category_active) {
    throw new AppError({ code: 'CONFLICT', statusCode: 409, message: 'Inactive categories cannot be posted.' })
  }
  if (!row.posting_account_id || row.posting_account_type !== input.transactionType) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'The selected category is not mapped to a matching account head.',
    })
  }
  if (!row.posting_account_active || !row.posting_allows_manual) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'The mapped account head is inactive or does not allow posting.',
    })
  }
  if (!row.bank_active) {
    throw new AppError({ code: 'CONFLICT', statusCode: 409, message: 'Inactive bank or cash accounts cannot be posted.' })
  }

  return row
}

export const postJournalForTransaction = async (
  client: PoolClient,
  input: {
    societyId: string
    transactionId: string
    transactionType: 'INCOME' | 'EXPENSE'
    categoryId: string
    bankAccountId: string
    billingPeriodId?: string | null
    transactionDate: string
    amount: number
    description?: string | null
    postedByUserId: string
  },
) => {
  const existing = await client.query<{ id: string; voucher_number: string }>(
    'select id, voucher_number from journal_entries where transaction_id = $1 limit 1',
    [input.transactionId],
  )
  if (existing.rows[0]) {
    return existing.rows[0]
  }

  const context = await loadPostingContext(client, input.societyId, input)
  const voucherNumber = await nextJournalVoucherNumber(client, input.transactionDate)
  const entryResult = await client.query<{ id: string; voucher_number: string }>(
    `
      insert into journal_entries (
        society_id,
        voucher_number,
        transaction_id,
        billing_period_id,
        entry_date,
        description,
        status,
        posted_by_user_id,
        posted_at
      )
      values ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, now())
      returning id, voucher_number
    `,
    [
      input.societyId,
      voucherNumber,
      input.transactionId,
      input.billingPeriodId ?? null,
      input.transactionDate,
      input.description ?? null,
      input.postedByUserId,
    ],
  )
  const entry = entryResult.rows[0]
  if (!entry) {
    throw new AppError({ code: 'INTERNAL_ERROR', statusCode: 500, message: 'Journal entry creation failed.' })
  }

  const debitAccountId = input.transactionType === 'EXPENSE'
    ? context.posting_account_id
    : context.bank_account_head_id
  const creditAccountId = input.transactionType === 'EXPENSE'
    ? context.bank_account_head_id
    : context.posting_account_id

  await client.query(
    `
      insert into journal_lines (journal_entry_id, line_no, account_head_id, line_type, amount, description)
      values
        ($1, 1, $2, 'DEBIT', $4, $5),
        ($1, 2, $3, 'CREDIT', $4, $5)
    `,
    [entry.id, debitAccountId, creditAccountId, roundMoney(input.amount), input.description ?? null],
  )
  await client.query(
    `
      update journal_entries
      set status = 'POSTED', posted_at = now(), posted_by_user_id = $2
      where id = $1
    `,
    [entry.id, input.postedByUserId],
  )
  await client.query(
    `
      update transactions
      set status = 'POSTED', posted_at = now(), approved_by_user_id = coalesce(approved_by_user_id, $2), approved_at = coalesce(approved_at, now())
      where id = $1
    `,
    [input.transactionId, input.postedByUserId],
  )

  return entry
}

export const createFinanceTransaction = async (
  client: PoolClient,
  input: Omit<TransactionInput, 'submitForPosting'> & {
    submitForPosting?: boolean
    societyId: string
    actorUserId: string
    actorRole: string
  },
) => {
  await validateFinanceTransactionContext(client, input.societyId, input)
  const initialStatus = input.submitForPosting === false ? 'DRAFT' : 'PENDING_REVIEW'

  const result = await client.query<{ id: string }>(
    `
      insert into transactions (
        society_id,
        transaction_type,
        category_id,
        bank_account_id,
        billing_period_id,
        title,
        description,
        counterparty_name,
        voucher_number,
        transaction_date,
        amount,
        status,
        created_by_user_id
      )
      values (
        $1,
        $2::transaction_type,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12::finance_lifecycle_status,
        $13::uuid
      )
      returning id
    `,
    [
      input.societyId,
      input.transactionType,
      input.categoryId,
      input.bankAccountId,
      input.billingPeriodId ?? null,
      input.title,
      input.description ?? null,
      input.counterpartyName ?? null,
      input.voucherNumber ?? null,
      input.transactionDate,
      roundMoney(input.amount),
      initialStatus,
      input.actorUserId,
    ],
  )
  const transactionId = result.rows[0]?.id
  if (!transactionId) {
    throw new AppError({ code: 'INTERNAL_ERROR', statusCode: 500, message: 'Transaction creation failed.' })
  }

  if (input.submitForPosting !== false) {
    await postJournalForTransaction(client, {
      societyId: input.societyId,
      transactionId,
      transactionType: input.transactionType,
      categoryId: input.categoryId,
      bankAccountId: input.bankAccountId,
      billingPeriodId: input.billingPeriodId ?? null,
      transactionDate: input.transactionDate,
      amount: input.amount,
      description: input.description ?? input.title,
      postedByUserId: input.actorUserId,
    })

    return { id: transactionId, status: 'POSTED' }
  }

  return { id: transactionId, status: initialStatus }
}

export const approveFinanceTransaction = async (
  client: PoolClient,
  input: { societyId: string; transactionId: string; actorUserId: string },
) => {
  const result = await client.query<{
    id: string
    transaction_type: 'INCOME' | 'EXPENSE'
    category_id: string
    bank_account_id: string
    billing_period_id: string | null
    transaction_date: string
    amount: string
    title: string
    description: string | null
    status: string
  }>(
    `
      select id, transaction_type::text, category_id, bank_account_id, billing_period_id, transaction_date::text, amount::text, title, description, status::text
      from transactions
      where id = $1 and society_id = $2
      for update
    `,
    [input.transactionId, input.societyId],
  )
  const tx = result.rows[0]
  if (!tx) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Transaction not found.' })
  }
  if (!['PENDING_REVIEW', 'RETURNED', 'DRAFT'].includes(tx.status)) {
    throw new AppError({ code: 'CONFLICT', statusCode: 409, message: 'Only draft, returned, or pending transactions can be approved.' })
  }

  await postJournalForTransaction(client, {
    societyId: input.societyId,
    transactionId: tx.id,
    transactionType: tx.transaction_type,
    categoryId: tx.category_id,
    bankAccountId: tx.bank_account_id,
    billingPeriodId: tx.billing_period_id,
    transactionDate: tx.transaction_date,
    amount: Number(tx.amount),
    description: tx.description ?? tx.title,
    postedByUserId: input.actorUserId,
  })
}

export const reverseFinanceTransaction = async (
  client: PoolClient,
  input: { societyId: string; transactionId: string; actorUserId: string; reason: string },
) => {
  const txResult = await client.query<{ id: string; status: string; title: string }>(
    `
      select id, status::text, title
      from transactions
      where id = $1 and society_id = $2
      for update
    `,
    [input.transactionId, input.societyId],
  )
  const tx = txResult.rows[0]
  if (!tx) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Transaction not found.' })
  }
  if (tx.status !== 'POSTED') {
    throw new AppError({ code: 'CONFLICT', statusCode: 409, message: 'Only posted transactions can be reversed.' })
  }

  const entryResult = await client.query<{
    id: string
    voucher_number: string
    billing_period_id: string | null
    entry_date: string
    description: string | null
  }>(
    `
      select id, voucher_number, billing_period_id, entry_date::text, description
      from journal_entries
      where transaction_id = $1 and society_id = $2 and status = 'POSTED'
      for update
    `,
    [input.transactionId, input.societyId],
  )
  const original = entryResult.rows[0]
  if (!original) {
    throw new AppError({ code: 'CONFLICT', statusCode: 409, message: 'Posted journal entry was not found.' })
  }

  const alreadyReversed = await client.query<{ id: string }>(
    'select id from journal_entries where reversal_of_entry_id = $1 and status = $2 limit 1',
    [original.id, 'POSTED'],
  )
  if (alreadyReversed.rows[0]) {
    throw new AppError({ code: 'CONFLICT', statusCode: 409, message: 'This transaction already has a reversal journal.' })
  }

  const voucherNumber = await nextJournalVoucherNumber(client, original.entry_date)
  const reversal = await client.query<{ id: string }>(
    `
      insert into journal_entries (
        society_id,
        voucher_number,
        transaction_id,
        billing_period_id,
        entry_date,
        description,
        status,
        posted_by_user_id,
        posted_at,
        reversal_of_entry_id
      )
      values ($1, $2, null, $3, $4, $5, 'DRAFT', $6, now(), $7)
      returning id
    `,
    [
      input.societyId,
      voucherNumber,
      original.billing_period_id,
      original.entry_date,
      `Reversal of ${original.voucher_number}: ${input.reason}`,
      input.actorUserId,
      original.id,
    ],
  )
  const reversalId = reversal.rows[0]?.id
  if (!reversalId) {
    throw new AppError({ code: 'INTERNAL_ERROR', statusCode: 500, message: 'Reversal journal creation failed.' })
  }

  await client.query(
    `
      insert into journal_lines (journal_entry_id, line_no, account_head_id, line_type, amount, description)
      select
        $2,
        line_no,
        account_head_id,
        case when line_type = 'DEBIT' then 'CREDIT'::journal_line_type else 'DEBIT'::journal_line_type end,
        amount,
        $3
      from journal_lines
      where journal_entry_id = $1
      order by line_no
    `,
    [original.id, reversalId, input.reason],
  )
  await client.query(`update journal_entries set status = 'POSTED' where id = $1`, [reversalId])
  await client.query(
    `update transactions set status = 'REVERSED', reversed_at = now() where id = $1`,
    [input.transactionId],
  )

  return { reversalEntryId: reversalId, voucherNumber }
}

export const postMaintenanceReceiptJournal = async (
  client: PoolClient,
  input: { paymentId: string; societyId: string; postedByUserId: string; bankAccountId?: string | null },
) => {
  const existing = await client.query<{ id: string; voucher_number: string }>(
    'select id, voucher_number from journal_entries where payment_id = $1 limit 1',
    [input.paymentId],
  )
  if (existing.rows[0]) {
    return existing.rows[0]
  }

  const payment = await client.query<{
    id: string
    payment_date: string
    amount: string
    notes: string | null
    status: string
    received_for_flat_id: string | null
  }>(
    `
      select id, payment_date::text, amount::text, notes, status::text, received_for_flat_id
      from payments
      where id = $1 and society_id = $2
      for update
    `,
    [input.paymentId, input.societyId],
  )
  const paymentRow = payment.rows[0]
  if (!paymentRow) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Payment not found.' })
  }
  if (paymentRow.status !== 'VERIFIED') {
    throw new AppError({ code: 'CONFLICT', statusCode: 409, message: 'Only verified payments can be posted.' })
  }

  const bank = await client.query<{ account_head_id: string }>(
    `
      select account_head_id
      from society_bank_accounts
      where society_id = $1
        and is_active = true
        and ($2::uuid is null or id = $2)
      order by case when id = $2 then 0 when is_default then 1 else 2 end, created_at asc
      limit 1
    `,
    [input.societyId, input.bankAccountId ?? null],
  )
  const bankAccountHeadId = bank.rows[0]?.account_head_id
  if (!bankAccountHeadId) {
    throw new AppError({ code: 'VALIDATION_ERROR', statusCode: 400, message: 'Select or configure an active bank account for receipt posting.' })
  }

  const incomeHeads = await client.query<{ code: string; id: string }>(
    `
      select code, id
      from account_heads
      where (society_id = $1 or society_id is null)
        and code in ('INC-MAINT', 'INC-LATEFEE')
        and is_active = true
    `,
    [input.societyId],
  )
  const maintenanceHeadId = incomeHeads.rows.find((row) => row.code === 'INC-MAINT')?.id
  const lateFeeHeadId = incomeHeads.rows.find((row) => row.code === 'INC-LATEFEE')?.id
  if (!maintenanceHeadId || !lateFeeHeadId) {
    throw new AppError({ code: 'VALIDATION_ERROR', statusCode: 400, message: 'Maintenance and late-fee income heads are required before posting receipts.' })
  }

  const lateFeeResult = await client.query<{ late_fee: string }>(
    `
      select coalesce(sum(late_fee_component), 0)::text as late_fee
      from payment_allocations
      where payment_id = $1
    `,
    [input.paymentId],
  )
  const amount = roundMoney(Number(paymentRow.amount))
  const lateFee = roundMoney(Math.min(amount, Number(lateFeeResult.rows[0]?.late_fee ?? 0)))
  const maintenanceIncome = roundMoney(amount - lateFee)
  const voucherNumber = await nextJournalVoucherNumber(client, paymentRow.payment_date)
  const entry = await client.query<{ id: string; voucher_number: string }>(
    `
      insert into journal_entries (
        society_id,
        voucher_number,
        payment_id,
        entry_date,
        description,
        status,
        posted_by_user_id,
        posted_at
      )
      values ($1, $2, $3, $4, $5, 'DRAFT', $6, now())
      returning id, voucher_number
    `,
    [
      input.societyId,
      voucherNumber,
      input.paymentId,
      paymentRow.payment_date,
      paymentRow.notes ?? 'Maintenance receipt',
      input.postedByUserId,
    ],
  )
  const entryRow = entry.rows[0]
  if (!entryRow) {
    throw new AppError({ code: 'INTERNAL_ERROR', statusCode: 500, message: 'Receipt journal creation failed.' })
  }

  const lines: Array<[number, string, 'DEBIT' | 'CREDIT', number, string]> = [
    [1, bankAccountHeadId, 'DEBIT', amount, 'Maintenance receipt deposited'],
  ]
  if (maintenanceIncome > 0) {
    lines.push([2, maintenanceHeadId, 'CREDIT', maintenanceIncome, 'Maintenance income'])
  }
  if (lateFee > 0) {
    lines.push([lines.length + 1, lateFeeHeadId, 'CREDIT', lateFee, 'Late fee income'])
  }
  for (const line of lines) {
    await client.query(
      `
        insert into journal_lines (journal_entry_id, line_no, account_head_id, line_type, amount, description)
        values ($1, $2, $3, $4::journal_line_type, $5, $6)
      `,
      [entryRow.id, ...line],
    )
  }
  await client.query(`update journal_entries set status = 'POSTED' where id = $1`, [entryRow.id])

  return entryRow
}

export const computePeriodCloseSummary = async (
  client: PoolClient,
  input: { societyId: string; startDate: string; endDate: string },
) => {
  if (input.endDate < input.startDate) {
    throw new AppError({ code: 'VALIDATION_ERROR', statusCode: 400, message: 'End date must be on or after start date.' })
  }
  await assertNoClosedPeriodOverlap(client, input.societyId, input.startDate, input.endDate)

  const pending = await client.query<{ count: string }>(
    `
      select count(*)::text as count
      from transactions
      where society_id = $1
        and transaction_date between $2::date and $3::date
        and status in ('DRAFT', 'PENDING_REVIEW', 'RETURNED')
    `,
    [input.societyId, input.startDate, input.endDate],
  )
  const unposted = Number(pending.rows[0]?.count ?? 0)
  if (unposted > 0) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'Close is blocked while draft, returned, or pending finance records exist in the period.',
      details: { unpostedTransactions: unposted },
    })
  }

  const totals = await client.query<{
    opening_balance: string
    income_total: string
    expense_total: string
  }>(
    `
      select
        coalesce(sum(case
          when je.entry_date < $2::date and ah.head_type in ('ASSET', 'EXPENSE') and jl.line_type = 'DEBIT' then jl.amount
          when je.entry_date < $2::date and ah.head_type in ('ASSET', 'EXPENSE') and jl.line_type = 'CREDIT' then -jl.amount
          when je.entry_date < $2::date and ah.head_type in ('LIABILITY', 'EQUITY', 'INCOME') and jl.line_type = 'CREDIT' then jl.amount
          when je.entry_date < $2::date then -jl.amount
          else 0
        end), 0)::text as opening_balance,
        coalesce(sum(case
          when je.entry_date between $2::date and $3::date and ah.head_type = 'INCOME' and jl.line_type = 'CREDIT' then jl.amount
          when je.entry_date between $2::date and $3::date and ah.head_type = 'INCOME' then -jl.amount
          else 0
        end), 0)::text as income_total,
        coalesce(sum(case
          when je.entry_date between $2::date and $3::date and ah.head_type = 'EXPENSE' and jl.line_type = 'DEBIT' then jl.amount
          when je.entry_date between $2::date and $3::date and ah.head_type = 'EXPENSE' then -jl.amount
          else 0
        end), 0)::text as expense_total
      from journal_entries je
      join journal_lines jl on jl.journal_entry_id = je.id
      join account_heads ah on ah.id = jl.account_head_id
      where je.society_id = $1 and je.status = 'POSTED'
    `,
    [input.societyId, input.startDate, input.endDate],
  )
  const row = totals.rows[0]
  const openingBalance = roundMoney(Number(row?.opening_balance ?? 0))
  const incomeTotal = roundMoney(Number(row?.income_total ?? 0))
  const expenseTotal = roundMoney(Number(row?.expense_total ?? 0))
  const closingBalance = roundMoney(openingBalance + incomeTotal - expenseTotal)

  return {
    openingBalance,
    incomeTotal,
    expenseTotal,
    closingBalance,
    validationSnapshot: {
      unpostedTransactions: unposted,
      checkedAt: new Date().toISOString(),
    },
  }
}

export const writeFinanceAudit = async ({
  client,
  event,
  societyId,
  actorUserId,
  actorAuthUserId,
  action,
  eventKey,
  beforeState,
  afterState,
  metadata,
  relatedEntities,
}: {
  client: PoolClient
  event: H3Event
  societyId: string
  actorUserId?: string
  actorAuthUserId?: string
  action: AuditAction
  eventKey: string
  beforeState?: Record<string, unknown> | null
  afterState?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
  relatedEntities: Array<{
    entityTable: string
    entityId: string
    entityLabel?: string
  }>
}) =>
  writeAuditEvent(client, event, {
    module: 'FINANCE',
    eventKey,
    action,
    severity: resolveAuditSeverity(action),
    ...(actorUserId ? { actorUserId } : {}),
    ...(actorAuthUserId ? { actorAuthUserId } : {}),
    ...(metadata ? { metadata } : {}),
    ...(beforeState !== undefined ? { beforeState } : {}),
    ...(afterState !== undefined ? { afterState } : {}),
    relatedEntities: [
      { entityTable: 'society_profile', entityId: societyId },
      ...relatedEntities,
    ],
  })
