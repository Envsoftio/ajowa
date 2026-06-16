import { z } from 'zod'
import type { ChargeBreakdownItem } from '~/types/domain'

export const chargeBreakdownItemSchema = z.object({
  label: z.string().trim().min(1).max(200),
  amount: z.coerce.number().positive(),
})

export const chargeBreakdownSchema = z.array(chargeBreakdownItemSchema).min(1)

export const billingPeriodSchema = z.object({
  label: z.string().trim().min(2).max(200),
  frequency: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM']),
  startDate: z.string().date(),
  endDate: z.string().date(),
  dueDate: z.string().date(),
})

export const billingPeriodUpdateSchema = billingPeriodSchema.partial().extend({
  isLocked: z.boolean().optional(),
  lockReason: z.string().trim().max(500).nullable().optional(),
})

export const chargeConfigSchema = z.object({
  graceDays: z.coerce.number().int().nonnegative().default(0),
  lateFeePerDay: z.coerce.number().nonnegative().default(50),
  billingTenure: z
    .enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM'])
    .default('MONTHLY'),
  excessPaymentHandling: z
    .enum(['KEEP_AS_ADVANCE', 'REFUND', 'MANUAL_REVIEW'])
    .default('KEEP_AS_ADVANCE'),
  defaultCharges: chargeBreakdownSchema.optional().default([]),
  flatTypeCharges: z
    .array(
      z.object({
        flatType: z.string().trim().min(1),
        label: z.string().trim().min(1).optional(),
        charges: chargeBreakdownSchema,
      }),
    )
    .optional()
    .default([]),
  flatOverrideCharges: z
    .array(
      z.object({
        flatId: z.string().uuid(),
        flatNumber: z.string().trim().min(1).optional(),
        blockName: z.string().trim().optional(),
        charges: chargeBreakdownSchema,
      }),
    )
    .optional()
    .default([]),
})

export const dueGenerationSchema = z.object({
  billingPeriodId: z.string().uuid(),
  flatIds: z.array(z.string().uuid()).optional(),
})

export const dueWaiveSchema = z.object({
  waived: z.boolean(),
  reason: z.string().trim().min(2).max(500),
})

export const dueReminderSchema = z.object({
  dueIds: z.array(z.string().uuid()).min(1).max(500),
})

export type BillingPeriodInput = z.infer<typeof billingPeriodSchema>
export type BillingPeriodUpdateInput = z.infer<typeof billingPeriodUpdateSchema>
export type ChargeConfigInput = z.infer<typeof chargeConfigSchema>
export type DueGenerationInput = z.infer<typeof dueGenerationSchema>
export type DueWaiveInput = z.infer<typeof dueWaiveSchema>
export type DueReminderInput = z.infer<typeof dueReminderSchema>

export const todayDate = () => new Date().toISOString().slice(0, 10)

export type DueAmountInput = {
  dueDate: string
  baseAmount: number
  paidAmount: number
  waivedAmount: number
  storedStatus: string
}

export type ComputedDueAmounts = {
  lateFeeAmount: number
  totalAmount: number
  balanceAmount: number
  status: import('~/types/domain').DueStatus
}

export const computeLateFee = (
  dueDate: string,
  today: string,
  graceDays: number,
  lateFeePerDay: number,
): number => {
  const due = new Date(dueDate)
  const now = new Date(today)
  const diffMs = now.getTime() - due.getTime()
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)) - graceDays)
  return Math.round(diffDays * lateFeePerDay * 100) / 100
}

export const computeDueAmounts = (
  due: DueAmountInput,
  today: string,
  graceDays: number,
  lateFeePerDay: number,
): ComputedDueAmounts => {
  const lateFeeAmount = computeLateFee(due.dueDate, today, graceDays, lateFeePerDay)
  const totalAmount = Math.max(
    0,
    Math.round((due.baseAmount + lateFeeAmount - due.waivedAmount) * 100) / 100,
  )
  const balanceAmount = Math.max(0, Math.round((totalAmount - due.paidAmount) * 100) / 100)
  let status = due.storedStatus as import('~/types/domain').DueStatus

  if (!['WAIVED', 'CANCELLED'].includes(status)) {
    if (balanceAmount <= 0) {
      status = 'PAID'
    } else if (due.paidAmount > 0) {
      status = 'PARTIALLY_PAID'
    } else if (lateFeeAmount > 0) {
      status = 'OVERDUE'
    } else {
      status = 'OPEN'
    }
  }

  return {
    lateFeeAmount,
    totalAmount,
    balanceAmount,
    status,
  }
}

export const getDaysOverdue = (dueDate: string, today: string): number => {
  const due = new Date(dueDate)
  const now = new Date(today)
  const diffMs = now.getTime() - due.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

export const mapRowToBillingPeriod = <
  TRow extends {
    id: string
    society_id: string
    label: string
    frequency: string
    start_date: string
    end_date: string
    due_date: string
    is_locked: boolean
    locked_at: string | null
    lock_reason: string | null
    created_at: string
    updated_at: string
    due_count?: string
    paid_due_count?: string
    unpaid_due_count?: string
  },
>(
  row: TRow,
) => {
  const result: Record<string, unknown> = {
    id: row.id,
    societyId: row.society_id,
    label: row.label,
    frequency: row.frequency,
    startDate: row.start_date,
    endDate: row.end_date,
    dueDate: row.due_date,
    isLocked: row.is_locked,
    lockedAt: row.locked_at,
    lockReason: row.lock_reason,
    status: row.is_locked ? 'LOCKED' : 'OPEN',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  if (row.due_count != null) {
    result.dueCount = Number(row.due_count)
  }

  if (row.paid_due_count != null) {
    result.paidDueCount = Number(row.paid_due_count)
  }

  if (row.unpaid_due_count != null) {
    result.unpaidDueCount = Number(row.unpaid_due_count)
  }

  return result as unknown as import('~/types/domain').BillingPeriod
}

export const resolveChargeBreakdown = (
  defaultCharges: ChargeBreakdownItem[],
  flatTypeCharges: { flatType: string; charges: ChargeBreakdownItem[] }[],
  flatOverrideCharges: { flatId: string; charges: ChargeBreakdownItem[] }[],
  flatType: string,
  flatId: string,
): ChargeBreakdownItem[] => {
  const override = flatOverrideCharges.find((f) => f.flatId === flatId)
  if (override) {
    return override.charges
  }

  const typeCharges = flatTypeCharges.find((f) => f.flatType === flatType)
  if (typeCharges) {
    return typeCharges.charges
  }

  return defaultCharges
}
