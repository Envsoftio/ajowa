import type { PoolClient } from 'pg'
import { z } from 'zod'
import {
  addBillingDays,
  computeDueAmounts,
  getPenaltyFreeUntilDate,
  todayDate,
} from './billing'

export const camPaymentArrangementSchema = z.object({
  flatId: z.string().uuid(),
  penaltyFreeUntilDay: z.coerce.number().int().min(1).max(31).default(26),
  effectiveFrom: z.string().date(),
  effectiveUntil: z.string().date().nullable().optional(),
  reason: z.string().trim().min(2).max(500),
  reference: z.string().trim().max(200).nullable().optional(),
  isActive: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.effectiveUntil && value.effectiveUntil < value.effectiveFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['effectiveUntil'],
      message: 'Effective until cannot be before effective from.',
    })
  }
})

export type CamPaymentArrangementInput = z.infer<typeof camPaymentArrangementSchema>

export type ActiveCamPaymentArrangementRow = {
  id: string
  flat_id: string
  penalty_free_until_day: number
  effective_from: string
  effective_until: string | null
}

type DueArrangementSyncRow = {
  id: string
  billing_period_id: string
  flat_id: string
  due_date: string
  base_amount: string
  paid_amount: string
  waived_amount: string
  status: string
  arrangement_id: string | null
  penalty_free_until_day: number | null
}

type DueArrangementSyncPayload = {
  dueId: string
  arrangementId: string | null
  lateFeeStartsOn: string | null
  lateFeeAmount: number
  totalAmount: number
  balanceAmount: number
  status: string
}

const formatDate = (date: Date) => date.toISOString().slice(0, 10)

export const getArrangementPenaltyFreeUntilDate = (
  dueDate: string,
  penaltyFreeUntilDay: number,
) => {
  const due = new Date(`${dueDate}T00:00:00Z`)
  const monthLastDay = new Date(
    Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0),
  ).getUTCDate()
  const safeDay = Math.min(Math.max(1, penaltyFreeUntilDay), monthLastDay)
  const freeUntil = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), safeDay))

  if (freeUntil < due) {
    return dueDate
  }

  return formatDate(freeUntil)
}

export const getArrangementLateFeeStartsOn = (
  dueDate: string,
  penaltyFreeUntilDay: number,
) => addBillingDays(getArrangementPenaltyFreeUntilDate(dueDate, penaltyFreeUntilDay), 1)

export const getActiveCamPaymentArrangementsForDueDate = async (
  client: PoolClient,
  input: {
    societyId: string
    flatIds: string[]
    dueDate: string
  },
) => {
  const flatIds = [...new Set(input.flatIds)].filter(Boolean)
  if (flatIds.length === 0) {
    return new Map<string, ActiveCamPaymentArrangementRow>()
  }

  const result = await client.query<ActiveCamPaymentArrangementRow>(
    `
      select distinct on (flat_id)
        id,
        flat_id,
        penalty_free_until_day,
        effective_from::text,
        effective_until::text
      from cam_payment_arrangements
      where society_id = $1
        and flat_id = any($2::uuid[])
        and is_active = true
        and revoked_at is null
        and effective_from <= $3::date
        and (effective_until is null or effective_until >= $3::date)
      order by flat_id, effective_from desc, created_at desc
    `,
    [input.societyId, flatIds, input.dueDate],
  )

  return new Map(result.rows.map((row) => [row.flat_id, row]))
}

export const syncCamPaymentArrangementDues = async (
  client: PoolClient,
  input: {
    societyId: string
    flatIds?: string[]
    graceDays: number
    lateFeePerDay: number
    asOfDate?: string
  },
) => {
  const values: unknown[] = [input.societyId]
  const flatFilter = input.flatIds?.length
    ? (() => {
        values.push([...new Set(input.flatIds)])
        return `and md.flat_id = any($${values.length}::uuid[])`
      })()
    : ''

  const result = await client.query<DueArrangementSyncRow>(
    `
      select
        md.id,
        md.billing_period_id,
        md.flat_id,
        md.due_date::text,
        md.base_amount::text,
        md.paid_amount::text,
        md.waived_amount::text,
        md.status::text,
        arrangement.id as arrangement_id,
        arrangement.penalty_free_until_day
      from maintenance_dues md
      inner join billing_periods bp on bp.id = md.billing_period_id
      left join lateral (
        select cpa.id, cpa.penalty_free_until_day
        from cam_payment_arrangements cpa
        where cpa.society_id = md.society_id
          and cpa.flat_id = md.flat_id
          and cpa.is_active = true
          and cpa.revoked_at is null
          and cpa.effective_from <= md.due_date
          and (cpa.effective_until is null or cpa.effective_until >= md.due_date)
        order by cpa.effective_from desc, cpa.created_at desc
        limit 1
      ) arrangement on true
      where md.society_id = $1
        and bp.charge_type = 'CAM'
        and bp.is_locked = false
        and md.status not in ('PAID', 'WAIVED', 'CANCELLED')
        ${flatFilter}
      for update of md
    `,
    values,
  )

  const asOfDate = input.asOfDate ?? todayDate()
  const updatePayload: DueArrangementSyncPayload[] = result.rows.map((due) => {
    const lateFeeStartsOn = due.arrangement_id && due.penalty_free_until_day
      ? getArrangementLateFeeStartsOn(due.due_date, due.penalty_free_until_day)
      : null
    const computed = computeDueAmounts(
      {
        dueDate: due.due_date,
        lateFeeStartsOn,
        baseAmount: Number(due.base_amount),
        paidAmount: Number(due.paid_amount),
        waivedAmount: Number(due.waived_amount),
        storedStatus: due.status,
      },
      asOfDate,
      input.graceDays,
      input.lateFeePerDay,
    )

    return {
      dueId: due.id,
      arrangementId: due.arrangement_id,
      lateFeeStartsOn,
      lateFeeAmount: computed.lateFeeAmount,
      totalAmount: computed.totalAmount,
      balanceAmount: computed.balanceAmount,
      status: computed.status,
    }
  })

  if (updatePayload.length > 0) {
    await client.query(
      `
        update maintenance_dues md
        set
          cam_payment_arrangement_id = payload.arrangement_id,
          late_fee_starts_on = payload.late_fee_starts_on,
          late_fee_amount = payload.late_fee_amount,
          total_amount = payload.total_amount,
          balance_amount = payload.balance_amount,
          status = payload.status::due_status,
          updated_at = now()
        from jsonb_to_recordset($1::jsonb) as payload(
          due_id uuid,
          arrangement_id uuid,
          late_fee_starts_on date,
          late_fee_amount numeric,
          total_amount numeric,
          balance_amount numeric,
          status text
        )
        where md.id = payload.due_id
          and md.society_id = $2
      `,
      [
        JSON.stringify(updatePayload.map((due) => ({
          due_id: due.dueId,
          arrangement_id: due.arrangementId,
          late_fee_starts_on: due.lateFeeStartsOn,
          late_fee_amount: due.lateFeeAmount,
          total_amount: due.totalAmount,
          balance_amount: due.balanceAmount,
          status: due.status,
        }))),
        input.societyId,
      ],
    )
  }

  return {
    matched: result.rows.length,
    updated: updatePayload.length,
    affectedDueIds: updatePayload.map((due) => due.dueId),
    affectedPairs: result.rows.map((due) => ({
      flatId: due.flat_id,
      billingPeriodId: due.billing_period_id,
    })),
  }
}

export const formatPenaltyFreeUntilLabel = (
  dueDate: string,
  graceDays: number,
  lateFeeStartsOn?: string | null,
) => getPenaltyFreeUntilDate(dueDate, graceDays, lateFeeStartsOn)
