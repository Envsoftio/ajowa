import type { PoolClient } from 'pg'
import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import {
  addBillingDays,
  computeBillingDueAmounts,
  dueLateFeeCorrectionSchema,
  getVerifiedDuePaymentEvents,
  todayDate,
  type DueLateFeeCorrectionInput,
} from '~/server/utils/billing'
import { setCamAdvanceCoverageForPeriod } from '~/server/utils/cam-advance'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import {
  normalizeSocietySettings,
  validatePayload,
  writeMasterAudit,
} from '~/server/utils/master-data'
import { recomputeUserAccess } from '~/server/utils/qr-access'
import type { ChargeBreakdownItem } from '~/types/domain'

type LateFeeCorrectionDueRow = {
  id: string
  society_id: string
  billing_period_id: string
  billing_period_label: string
  billing_period_charge_type: string
  billing_period_start_date: string
  billing_period_end_date: string
  is_locked: boolean
  flat_id: string
  flat_number: string
  block_name: string
  due_date: string
  late_fee_starts_on: string | null
  manual_late_fee_starts_on: string | null
  base_amount: string
  late_fee_amount: string
  waived_amount: string
  late_fee_waived_amount: string
  paid_amount: string
  total_amount: string
  balance_amount: string
  status: string
  charge_breakdown: unknown
}

type DueCorrectionResult = {
  dueId: string
  flatId: string
  billingPeriodId: string
  status: string
  lateFeeAmount: number
  lateFeeWaivedAmount: number
  waivedAmount: number
  paidAmount: number
  totalAmount: number
  balanceAmount: number
  manualLateFeeStartsOn: string | null
  changed: boolean
}

const roundMoney = (value: number) => Math.round(value * 100) / 100

const hasCamAdvanceAdjustment = (chargeBreakdown: readonly ChargeBreakdownItem[]) =>
  chargeBreakdown.some(
    (charge) =>
      Number(charge.camAdvanceAdjustmentAmount ?? 0) > 0 ||
      Number(charge.camAdvanceCoveredMonths ?? 0) > 0,
  )

const syncPaidCamCoverage = async (
  client: PoolClient,
  due: LateFeeCorrectionDueRow,
  status: string,
) => {
  await setCamAdvanceCoverageForPeriod(client, {
    societyId: due.society_id,
    flatId: due.flat_id,
    coveredFrom: due.billing_period_start_date,
    coveredUntil: status === 'PAID' ? due.billing_period_end_date : null,
    source: 'PAYMENT',
    reference: `maintenance_due:${due.id}`,
    notes:
      status === 'PAID'
        ? `CAM principal settled; late-fee state corrected for due ${due.id}.`
        : null,
    actorUserId: null,
  })
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validatePayload<DueLateFeeCorrectionInput>(
    dueLateFeeCorrectionSchema,
    await readJsonBody(event),
  )
  const dueIds = [...new Set(body.dueIds)]
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const settingsResult = await client.query<{ settings: Record<string, unknown> }>(
      `select settings from society_profile where id = $1 limit 1`,
      [authMe.user.societyId],
    )
    const settings = normalizeSocietySettings(settingsResult.rows[0]?.settings)

    const dueResult = await client.query<LateFeeCorrectionDueRow>(
      `
        select
          md.id,
          md.society_id,
          md.billing_period_id,
          bp.label as billing_period_label,
          bp.charge_type::text as billing_period_charge_type,
          bp.start_date::text as billing_period_start_date,
          bp.end_date::text as billing_period_end_date,
          bp.is_locked,
          md.flat_id,
          f.flat_number,
          b.name as block_name,
          md.due_date::text,
          md.late_fee_starts_on::text,
          md.manual_late_fee_starts_on::text,
          md.base_amount::text,
          md.late_fee_amount::text,
          md.waived_amount::text,
          md.late_fee_waived_amount::text,
          md.paid_amount::text,
          md.total_amount::text,
          md.balance_amount::text,
          md.status::text,
          md.charge_breakdown
        from maintenance_dues md
        inner join billing_periods bp on bp.id = md.billing_period_id
        inner join flats f on f.id = md.flat_id
        inner join blocks b on b.id = f.block_id
        where md.society_id = $1
          and md.id = any($2::uuid[])
        order by b.sort_order, f.flat_number
        for update of md
      `,
      [authMe.user.societyId, dueIds],
    )

    if (dueResult.rows.length !== dueIds.length) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'One or more selected dues are unavailable in this society.',
      })
    }

    const invalidDue = dueResult.rows.find(
      (due) =>
        due.is_locked ||
        due.billing_period_charge_type !== 'CAM' ||
        ['WAIVED', 'CANCELLED'].includes(due.status),
    )
    if (invalidDue) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: `${invalidDue.block_name} ${invalidDue.flat_number} cannot be corrected because its CAM period is locked or its due is closed.`,
      })
    }

    const allocationResult = await client.query<{
      maintenance_due_id: string
      paid_amount: string
    }>(
      `
        select
          pa.maintenance_due_id,
          coalesce(sum(pa.allocated_amount) filter (
            where p.status = 'VERIFIED'
          ), 0)::text as paid_amount
        from payment_allocations pa
        inner join payments p on p.id = pa.payment_id
        where pa.maintenance_due_id = any($1::uuid[])
        group by pa.maintenance_due_id
      `,
      [dueIds],
    )
    const verifiedPaidByDueId = new Map(
      allocationResult.rows.map((row) => [
        row.maintenance_due_id,
        Number(row.paid_amount),
      ]),
    )
    const paymentEventsByDueId = await getVerifiedDuePaymentEvents(
      client,
      dueIds,
    )

    const beforeEntries: Record<string, unknown>[] = []
    const afterEntries: Record<string, unknown>[] = []
    const results: DueCorrectionResult[] = []
    const asOfDate = todayDate()

    for (const due of dueResult.rows) {
      const chargeBreakdown = Array.isArray(due.charge_breakdown)
        ? due.charge_breakdown as ChargeBreakdownItem[]
        : []
      if (
        body.action === 'WAIVE_AND_CLOSE' &&
        hasCamAdvanceAdjustment(chargeBreakdown)
      ) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: `${due.block_name} ${due.flat_number} has an advance-adjusted CAM bill and requires individual review.`,
        })
      }

      const verifiedPaidAmount = roundMoney(
        verifiedPaidByDueId.get(due.id) ?? 0,
      )
      const baseAmount = Number(due.base_amount)
      const previousWaivedAmount = Number(due.waived_amount)
      const previousLateFeeWaivedAmount = Number(due.late_fee_waived_amount)
      const previousManualStart = due.manual_late_fee_starts_on
      let nextManualStart = previousManualStart
      let nextWaivedAmount = previousWaivedAmount
      let nextLateFeeWaivedAmount = previousLateFeeWaivedAmount

      if (body.action === 'DEFER') {
        if (!body.penaltyFreeUntil || body.penaltyFreeUntil < due.due_date) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            message: `Penalty-free date for ${due.block_name} ${due.flat_number} cannot be before its due date.`,
          })
        }
        nextManualStart = addBillingDays(body.penaltyFreeUntil, 1)
      } else if (body.action === 'CLEAR_DEFERMENT') {
        nextManualStart = null
      } else if (body.action === 'REVERSE_LATE_FEE_WAIVER') {
        nextWaivedAmount = roundMoney(
          Math.max(0, previousWaivedAmount - previousLateFeeWaivedAmount),
        )
        nextLateFeeWaivedAmount = 0
      }

      const paymentEvents = paymentEventsByDueId.get(due.id) ?? []
      const computedBeforeWaiver = computeBillingDueAmounts(
        {
          dueDate: due.due_date,
          billingPeriodChargeType: due.billing_period_charge_type,
          billingPeriodStartDate: due.billing_period_start_date,
          billingPeriodEndDate: due.billing_period_end_date,
          chargeBreakdown,
          lateFeeStartsOn: due.late_fee_starts_on,
          manualLateFeeStartsOn: nextManualStart,
          baseAmount,
          paidAmount: verifiedPaidAmount,
          waivedAmount: nextWaivedAmount,
          storedStatus: due.status,
          paymentEvents,
        },
        asOfDate,
        settings.graceDays,
        settings.lateFeePerDay,
      )

      if (body.action === 'WAIVE_AND_CLOSE') {
        const principalOutstanding = roundMoney(
          Math.max(0, baseAmount - verifiedPaidAmount),
        )
        if (principalOutstanding > 0) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            message: `${due.block_name} ${due.flat_number} still has ${principalOutstanding.toFixed(2)} of principal outstanding. Only late-fee-only balances can be closed.`,
          })
        }

        const outstandingLateFee = computedBeforeWaiver.balanceAmount
        nextWaivedAmount = roundMoney(
          nextWaivedAmount + outstandingLateFee,
        )
        nextLateFeeWaivedAmount = roundMoney(
          nextLateFeeWaivedAmount + outstandingLateFee,
        )
      }

      const computed = computeBillingDueAmounts(
        {
          dueDate: due.due_date,
          billingPeriodChargeType: due.billing_period_charge_type,
          billingPeriodStartDate: due.billing_period_start_date,
          billingPeriodEndDate: due.billing_period_end_date,
          chargeBreakdown,
          lateFeeStartsOn: due.late_fee_starts_on,
          manualLateFeeStartsOn: nextManualStart,
          baseAmount,
          paidAmount: verifiedPaidAmount,
          waivedAmount: nextWaivedAmount,
          storedStatus: due.status,
          paymentEvents,
        },
        asOfDate,
        settings.graceDays,
        settings.lateFeePerDay,
      )
      const nextStatus =
        body.action === 'WAIVE_AND_CLOSE' && computed.balanceAmount <= 0
          ? 'PAID'
          : computed.status
      const changed =
        previousManualStart !== nextManualStart ||
        previousWaivedAmount !== nextWaivedAmount ||
        previousLateFeeWaivedAmount !== nextLateFeeWaivedAmount ||
        Number(due.paid_amount) !== verifiedPaidAmount ||
        Number(due.late_fee_amount) !== computed.lateFeeAmount ||
        Number(due.total_amount) !== computed.totalAmount ||
        Number(due.balance_amount) !== computed.balanceAmount ||
        due.status !== nextStatus

      beforeEntries.push({
        dueId: due.id,
        flatId: due.flat_id,
        status: due.status,
        paidAmount: Number(due.paid_amount),
        lateFeeAmount: Number(due.late_fee_amount),
        waivedAmount: previousWaivedAmount,
        lateFeeWaivedAmount: previousLateFeeWaivedAmount,
        balanceAmount: Number(due.balance_amount),
        manualLateFeeStartsOn: previousManualStart,
      })
      afterEntries.push({
        dueId: due.id,
        flatId: due.flat_id,
        status: nextStatus,
        paidAmount: verifiedPaidAmount,
        lateFeeAmount: computed.lateFeeAmount,
        waivedAmount: nextWaivedAmount,
        lateFeeWaivedAmount: nextLateFeeWaivedAmount,
        balanceAmount: computed.balanceAmount,
        manualLateFeeStartsOn: nextManualStart,
      })

      if (changed) {
        await client.query(
          `
            update maintenance_dues
            set
              manual_late_fee_starts_on = $2::date,
              late_fee_amount = $3,
              waived_amount = $4,
              late_fee_waived_amount = $5,
              paid_amount = $6,
              total_amount = $7,
              balance_amount = $8,
              status = $9::due_status,
              updated_at = now()
            where id = $1
          `,
          [
            due.id,
            nextManualStart,
            computed.lateFeeAmount,
            nextWaivedAmount,
            nextLateFeeWaivedAmount,
            verifiedPaidAmount,
            computed.totalAmount,
            computed.balanceAmount,
            nextStatus,
          ],
        )
        await syncPaidCamCoverage(client, due, nextStatus)
      }

      results.push({
        dueId: due.id,
        flatId: due.flat_id,
        billingPeriodId: due.billing_period_id,
        status: nextStatus,
        lateFeeAmount: computed.lateFeeAmount,
        lateFeeWaivedAmount: nextLateFeeWaivedAmount,
        waivedAmount: nextWaivedAmount,
        paidAmount: verifiedPaidAmount,
        totalAmount: computed.totalAmount,
        balanceAmount: computed.balanceAmount,
        manualLateFeeStartsOn: nextManualStart,
        changed,
      })
    }

    const changedResults = results.filter((result) => result.changed)
    if (changedResults.length > 0) {
      await writeMasterAudit({
        client,
        event,
        actorUserId: authMe.user.id,
        actorAuthUserId: authMe.authUser.id,
        action: 'STATE_CHANGED',
        eventKey: `maintenance_dues.late_fee.${body.action.toLowerCase()}`,
        beforeState: { entries: beforeEntries },
        afterState: {
          entries: afterEntries,
          reason: body.reason,
          penaltyFreeUntil: body.penaltyFreeUntil ?? null,
        },
        metadata: {
          action: body.action,
          reason: body.reason,
          requestedCount: dueIds.length,
          changedCount: changedResults.length,
        },
        relatedEntities: dueResult.rows.map((due) => ({
          entityTable: 'maintenance_dues',
          entityId: due.id,
          entityLabel: `${due.block_name} ${due.flat_number} - ${due.billing_period_label}`,
        })),
      })

      const affectedUsers = await client.query<{
        user_id: string
        billing_period_id: string
      }>(
        `
          select distinct fr.user_id, md.billing_period_id
          from maintenance_dues md
          inner join flat_residents fr
            on fr.flat_id = md.flat_id
            and fr.is_active = true
          where md.id = any($1::uuid[])
        `,
        [changedResults.map((result) => result.dueId)],
      )
      for (const affected of affectedUsers.rows) {
        await recomputeUserAccess(
          affected.user_id,
          affected.billing_period_id,
          client,
        )
      }
    }

    await client.query('commit')

    return createApiSuccess(event, {
      action: body.action,
      requested: dueIds.length,
      updated: changedResults.length,
      unchanged: dueIds.length - changedResults.length,
      results,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
