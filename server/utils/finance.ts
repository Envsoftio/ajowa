import type { H3Event } from 'h3'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { writeAuditEvent, resolveAuditSeverity } from './audit'
import type { AuditAction } from '~/shared/audit'
import type { AccountHead, BankAccount } from '~/types/domain'

export const accountHeadTypes = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY'] as const
export const bankAccountTypes = ['SAVINGS', 'CURRENT', 'CASH_CREDIT', 'OVERDRAFT', 'OTHER'] as const

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

export type AccountHeadInput = z.infer<typeof accountHeadSchema>
export type AccountHeadUpdateInput = z.infer<typeof accountHeadUpdateSchema>
export type BankAccountInput = z.infer<typeof bankAccountSchema>
export type BankAccountUpdateInput = z.infer<typeof bankAccountUpdateSchema>

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
