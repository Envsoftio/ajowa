import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { normalizeSocietySettings, readUuidParam, validatePayload, writeMasterAudit } from '~/server/utils/master-data'
import { computeDueAmounts, dueWaiveSchema, todayDate, type DueWaiveInput } from '~/server/utils/billing'
import { recomputeUserAccess } from '~/server/utils/qr-access'

type DueWaiveRow = {
  id: string
  society_id: string
  billing_period_id: string
  billing_period_label: string
  flat_id: string
  flat_number: string
  block_name: string
  due_date: string
  late_fee_starts_on: string | null
  base_amount: string
  paid_amount: string
  waived_amount: string
  status: string
  is_locked: boolean
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const dueId = readUuidParam(event, 'id')
  const body = validatePayload<DueWaiveInput>(dueWaiveSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const settingsResult = await client.query<{ settings: Record<string, unknown> }>(
      `select settings from society_profile where id = $1 limit 1`,
      [authMe.user.societyId],
    )
    const settings = normalizeSocietySettings(settingsResult.rows[0]?.settings)

    const dueResult = await client.query<DueWaiveRow>(
      `
        select
          md.id,
          md.society_id,
          md.billing_period_id,
          bp.label as billing_period_label,
          md.flat_id,
          f.flat_number,
          b.name as block_name,
          md.due_date::text,
          md.late_fee_starts_on::text,
          md.base_amount::text,
          md.paid_amount::text,
          md.waived_amount::text,
          md.status::text,
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
        message: 'Cannot change waiver state for a locked billing period.',
      })
    }

    const baseAmount = Number(due.base_amount)
    const paidAmount = Number(due.paid_amount)
    const previousWaivedAmount = Number(due.waived_amount)
    const currentComputed = computeDueAmounts(
      {
        dueDate: due.due_date,
        lateFeeStartsOn: due.late_fee_starts_on,
        baseAmount,
        paidAmount,
        waivedAmount: previousWaivedAmount,
        storedStatus: due.status,
      },
      todayDate(),
      settings.graceDays,
      settings.lateFeePerDay,
    )

    const waivedAmount = body.waived
      ? Math.max(0, Math.round((baseAmount + currentComputed.lateFeeAmount - paidAmount) * 100) / 100)
      : 0
    const nextTotalAmount = Math.max(0.01, Math.round((baseAmount + currentComputed.lateFeeAmount - waivedAmount) * 100) / 100)
    const nextBalanceAmount = Math.max(0, Math.round((nextTotalAmount - paidAmount) * 100) / 100)
    const nextStatus = body.waived
      ? 'WAIVED'
      : paidAmount >= nextTotalAmount
        ? 'PAID'
        : paidAmount > 0
          ? 'PARTIALLY_PAID'
          : currentComputed.lateFeeAmount > 0
            ? 'OVERDUE'
            : 'OPEN'

    await client.query(
      `
        update maintenance_dues
        set
          late_fee_amount = $2,
          waived_amount = $3,
          total_amount = $4,
          balance_amount = $5,
          status = $6::due_status,
          updated_at = now()
        where id = $1
      `,
      [
        dueId,
        currentComputed.lateFeeAmount,
        waivedAmount,
        nextTotalAmount,
        nextBalanceAmount,
        nextStatus,
      ],
    )

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'STATE_CHANGED',
      eventKey: body.waived ? 'maintenance_due.waived' : 'maintenance_due.unwaived',
      beforeState: {
        status: due.status,
        waivedAmount: previousWaivedAmount,
        balanceAmount: currentComputed.balanceAmount,
      },
      afterState: {
        status: nextStatus,
        waivedAmount,
        balanceAmount: nextBalanceAmount,
        reason: body.reason,
      },
      metadata: {
        reason: body.reason,
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
      waived: body.waived,
      waivedAmount,
      balanceAmount: nextBalanceAmount,
      status: nextStatus,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
