import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import {
  getActiveCamPaymentArrangementsForDueDate,
  getArrangementLateFeeStartsOn,
} from '~/server/utils/cam-payment-arrangements'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import {
  normalizeSocietySettings,
  readUuidParam,
  validatePayload,
  writeMasterAudit,
} from '~/server/utils/master-data'
import {
  computeDueAmounts,
  dueUpdateSchema,
  todayDate,
  type DueUpdateInput,
} from '~/server/utils/billing'
import { recomputeUserAccess } from '~/server/utils/qr-access'
import type { ChargeBreakdownItem } from '~/types/domain'

type DueEditRow = {
  id: string
  society_id: string
  billing_period_id: string
  billing_period_label: string
  billing_period_charge_type: string
  billing_period_start_date: string
  flat_id: string
  flat_number: string
  block_name: string
  due_date: string
  late_fee_starts_on: string | null
  cam_payment_arrangement_id: string | null
  base_amount: string
  late_fee_amount: string
  paid_amount: string
  waived_amount: string
  total_amount: string
  balance_amount: string
  status: string
  charge_breakdown: unknown
  is_locked: boolean
}

const roundMoney = (value: number) => Math.round(value * 100) / 100

const buildEditedChargeBreakdown = (
  amount: number,
  chargeType: string,
): ChargeBreakdownItem[] => {
  const item: ChargeBreakdownItem = {
    label: 'Edited maintenance bill amount',
    amount,
    source: 'MANUAL_EDIT',
  }

  if (chargeType === 'CAM' || chargeType === 'DG_SET') {
    item.chargeType = chargeType
  }

  return [item]
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const dueId = readUuidParam(event, 'id')
  const body = validatePayload<DueUpdateInput>(dueUpdateSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const settingsResult = await client.query<{ settings: Record<string, unknown> }>(
      `select settings from society_profile where id = $1 limit 1`,
      [authMe.user.societyId],
    )
    const settings = normalizeSocietySettings(settingsResult.rows[0]?.settings)

    const dueResult = await client.query<DueEditRow>(
      `
        select
          md.id,
          md.society_id,
          md.billing_period_id,
          bp.label as billing_period_label,
          bp.charge_type::text as billing_period_charge_type,
          bp.start_date::text as billing_period_start_date,
          md.flat_id,
          f.flat_number,
          b.name as block_name,
          md.due_date::text,
          md.late_fee_starts_on::text,
          md.cam_payment_arrangement_id::text,
          md.base_amount::text,
          md.late_fee_amount::text,
          md.paid_amount::text,
          md.waived_amount::text,
          md.total_amount::text,
          md.balance_amount::text,
          md.status::text,
          md.charge_breakdown,
          bp.is_locked
        from maintenance_dues md
        inner join billing_periods bp on bp.id = md.billing_period_id
        inner join flats f on f.id = md.flat_id
        inner join blocks b on b.id = f.block_id
        where md.id = $1 and md.society_id = $2
        limit 1
      `,
      [dueId, authMe.user.societyId],
    )

    const due = dueResult.rows[0]
    if (!due) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Maintenance due not found.',
      })
    }

    if (due.is_locked) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Cannot edit dues for a locked billing period.',
      })
    }

    if (['PAID', 'WAIVED', 'CANCELLED'].includes(due.status)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Only open, overdue, or partially paid dues can be edited.',
      })
    }

    const nextDueDate = body.dueDate ?? due.due_date
    if (nextDueDate < due.billing_period_start_date) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Due date cannot be before the billing period start date.',
      })
    }

    const previousBaseAmount = Number(due.base_amount)
    const nextBaseAmount = roundMoney(body.baseAmount ?? previousBaseAmount)
    const paidAmount = Number(due.paid_amount)
    const waivedAmount = Number(due.waived_amount)
    const arrangementsByFlatId = due.billing_period_charge_type === 'CAM'
      ? await getActiveCamPaymentArrangementsForDueDate(client, {
          societyId: authMe.user.societyId,
          flatIds: [due.flat_id],
          dueDate: nextDueDate,
        })
      : new Map()
    const arrangement = arrangementsByFlatId.get(due.flat_id)
    const nextLateFeeStartsOn = arrangement
      ? getArrangementLateFeeStartsOn(nextDueDate, arrangement.penalty_free_until_day)
      : null
    const nextComputed = computeDueAmounts(
      {
        dueDate: nextDueDate,
        lateFeeStartsOn: nextLateFeeStartsOn,
        baseAmount: nextBaseAmount,
        paidAmount,
        waivedAmount,
        storedStatus: due.status,
      },
      todayDate(),
      settings.graceDays,
      settings.lateFeePerDay,
    )

    if (nextComputed.totalAmount < paidAmount) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Edited bill total cannot be lower than payments already allocated to this due.',
      })
    }

    const baseAmountChanged = nextBaseAmount !== previousBaseAmount
    const nextChargeBreakdown = baseAmountChanged
      ? buildEditedChargeBreakdown(nextBaseAmount, due.billing_period_charge_type)
      : due.charge_breakdown

    await client.query(
      `
        update maintenance_dues
        set
          due_date = $2::date,
          base_amount = $3,
          late_fee_amount = $4,
          total_amount = $5,
          balance_amount = $6,
          status = $7::due_status,
          charge_breakdown = $8::jsonb,
          cam_payment_arrangement_id = $9,
          late_fee_starts_on = $10::date,
          updated_at = now()
        where id = $1
      `,
      [
        dueId,
        nextDueDate,
        nextBaseAmount,
        nextComputed.lateFeeAmount,
        nextComputed.totalAmount,
        nextComputed.balanceAmount,
        nextComputed.status,
        JSON.stringify(nextChargeBreakdown),
        arrangement?.id ?? null,
        nextLateFeeStartsOn,
      ],
    )

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'UPDATED',
      eventKey: 'maintenance_due.updated',
      beforeState: {
        dueDate: due.due_date,
        baseAmount: previousBaseAmount,
        lateFeeAmount: Number(due.late_fee_amount),
        totalAmount: Number(due.total_amount),
        balanceAmount: Number(due.balance_amount),
        status: due.status,
        lateFeeStartsOn: due.late_fee_starts_on,
        camPaymentArrangementId: due.cam_payment_arrangement_id,
      },
      afterState: {
        dueDate: nextDueDate,
        baseAmount: nextBaseAmount,
        lateFeeAmount: nextComputed.lateFeeAmount,
        totalAmount: nextComputed.totalAmount,
        balanceAmount: nextComputed.balanceAmount,
        status: nextComputed.status,
        lateFeeStartsOn: nextLateFeeStartsOn,
        camPaymentArrangementId: arrangement?.id ?? null,
        note: body.note ?? null,
      },
      metadata: {
        note: body.note ?? null,
        billingPeriodId: due.billing_period_id,
        flatId: due.flat_id,
      },
      relatedEntities: [
        {
          entityTable: 'maintenance_dues',
          entityId: due.id,
          entityLabel: `${due.block_name} ${due.flat_number} - ${due.billing_period_label}`,
        },
      ],
    })

    const affectedUsers = await client.query<{ user_id: string }>(
      `
        select distinct user_id
        from flat_residents
        where flat_id = $1 and is_active = true
      `,
      [due.flat_id],
    )

    for (const user of affectedUsers.rows) {
      await recomputeUserAccess(user.user_id, due.billing_period_id, client)
    }

    await client.query('commit')

    return createApiSuccess(event, {
      id: dueId,
      dueDate: nextDueDate,
      baseAmount: nextBaseAmount,
      lateFeeAmount: nextComputed.lateFeeAmount,
      totalAmount: nextComputed.totalAmount,
      balanceAmount: nextComputed.balanceAmount,
      status: nextComputed.status,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
