import type { PoolClient } from 'pg'
import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import {
  computeDueAmounts,
  dueBulkDueDateUpdateSchema,
  todayDate,
  type DueBulkDueDateUpdateInput,
} from '~/server/utils/billing'
import { camAdvanceCoverageExistsSql } from '~/server/utils/cam-advance'
import { getDatabasePool } from '~/server/utils/database'
import {
  normalizeSocietySettings,
  validatePayload,
  writeMasterAudit,
} from '~/server/utils/master-data'
import { recomputeUserAccessForPairs } from '~/server/utils/qr-access'

type BulkDueDateRow = {
  id: string
  billing_period_id: string
  billing_period_label: string
  billing_period_start_date: string
  flat_id: string
  flat_number: string
  block_name: string
  due_date: string
  base_amount: string
  late_fee_amount: string
  paid_amount: string
  waived_amount: string
  total_amount: string
  balance_amount: string
  status: string
  is_locked: boolean
  is_cam_advance_covered: boolean
}

type BulkDueDateUpdatePayload = {
  id: string
  dueDate: string
  lateFeeAmount: number
  totalAmount: number
  balanceAmount: number
  status: string
}

type BulkDueDateFilters = NonNullable<DueBulkDueDateUpdateInput['filters']>

const incrementCount = (counts: Record<string, number>, key: string) => {
  counts[key] = (counts[key] ?? 0) + 1
}

const camAdvanceCoveredSql = `(
  bp.charge_type = 'CAM'
  and ${camAdvanceCoverageExistsSql('f', 'bp')}
)`

const bulkDueDateRowsSql = (whereSql: string) => `
  select
    md.id,
    md.billing_period_id,
    bp.label as billing_period_label,
    bp.start_date::text as billing_period_start_date,
    md.flat_id,
    f.flat_number,
    b.name as block_name,
    md.due_date::text,
    md.base_amount::text,
    md.late_fee_amount::text,
    md.paid_amount::text,
    md.waived_amount::text,
    md.total_amount::text,
    md.balance_amount::text,
    md.status::text,
    bp.is_locked,
    ${camAdvanceCoveredSql} as is_cam_advance_covered
  from maintenance_dues md
  inner join billing_periods bp on bp.id = md.billing_period_id
  inner join flats f on f.id = md.flat_id
  inner join blocks b on b.id = f.block_id
  left join lateral (
    select u.full_name
    from flat_residents fr
    inner join users u on u.id = fr.user_id
    where fr.flat_id = md.flat_id
      and fr.is_active = true
      and fr.is_billing_contact = true
    limit 1
  ) billing_contact on true
  where ${whereSql}
  order by bp.start_date asc, b.sort_order asc, f.flat_number asc
`

const buildFilterWhere = (
  societyId: string,
  filters: BulkDueDateFilters,
  today: string,
) => {
  const where: string[] = ['md.society_id = $1']
  const values: unknown[] = [societyId]

  if (filters.search) {
    values.push(`%${filters.search}%`)
    where.push(`(f.flat_number ilike $${values.length} or b.name ilike $${values.length} or billing_contact.full_name ilike $${values.length})`)
  }

  if (filters.billingPeriodId) {
    values.push(filters.billingPeriodId)
    where.push(`md.billing_period_id = $${values.length}`)
  }

  if (filters.chargeType) {
    values.push(filters.chargeType)
    where.push(`bp.charge_type::text = $${values.length}`)
  }

  if (filters.status) {
    values.push(filters.status)
    where.push(`case when ${camAdvanceCoveredSql} then 'PAID' else md.status::text end = $${values.length}`)
  }

  if (filters.balance === 'outstanding') {
    where.push(`not ${camAdvanceCoveredSql} and md.balance_amount::numeric > 0`)
  } else if (filters.balance === 'paid') {
    where.push(`(${camAdvanceCoveredSql} or md.balance_amount::numeric = 0)`)
  }

  if (filters.overdue === 'true') {
    values.push(today)
    where.push(`not ${camAdvanceCoveredSql} and md.balance_amount::numeric > 0 and md.due_date < $${values.length}::date`)
  }

  if (filters.advance === 'covered') {
    where.push(camAdvanceCoveredSql)
  } else if (filters.advance === 'billable') {
    where.push(`not ${camAdvanceCoveredSql}`)
  }

  return {
    whereSql: where.join(' and '),
    values,
  }
}

const getSelectedDueRows = async (
  client: PoolClient,
  societyId: string,
  dueIds: string[],
) =>
  client.query<BulkDueDateRow>(
    bulkDueDateRowsSql(`md.society_id = $1 and md.id = any($2::uuid[])`),
    [societyId, dueIds],
  )

const getFilteredDueRows = async (
  client: PoolClient,
  societyId: string,
  filters: BulkDueDateFilters,
  today: string,
) => {
  const filterWhere = buildFilterWhere(societyId, filters, today)

  return client.query<BulkDueDateRow>(
    bulkDueDateRowsSql(filterWhere.whereSql),
    filterWhere.values,
  )
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validatePayload<DueBulkDueDateUpdateInput>(
    dueBulkDueDateUpdateSchema,
    await readJsonBody(event),
  )
  const dueIds = body.dueIds ? Array.from(new Set(body.dueIds)) : []
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')
    const today = todayDate()

    const settingsResult = await client.query<{ settings: Record<string, unknown> }>(
      `select settings from society_profile where id = $1 limit 1`,
      [authMe.user.societyId],
    )
    const settings = normalizeSocietySettings(settingsResult.rows[0]?.settings)

    const selectionSource = body.filters ? 'filters' : 'ids'
    const dueResult = body.filters
      ? await getFilteredDueRows(client, authMe.user.societyId, body.filters, today)
      : await getSelectedDueRows(client, authMe.user.societyId, dueIds)

    const updatePayload: BulkDueDateUpdatePayload[] = []
    const unchangedRows: BulkDueDateRow[] = []
    const requestedDueCount =
      selectionSource === 'ids' ? dueIds.length : dueResult.rows.length
    const skipped = {
      notFound:
        selectionSource === 'ids'
          ? Math.max(0, dueIds.length - dueResult.rows.length)
          : 0,
      locked: 0,
      closed: 0,
      covered: 0,
      beforePeriodStart: 0,
      paymentConflict: 0,
    }
    const previousDueDateCounts: Record<string, number> = {}
    let accessRecomputed = 0
    let accessRevoked = 0

    for (const due of dueResult.rows) {
      incrementCount(previousDueDateCounts, due.due_date)

      if (due.is_locked) {
        skipped.locked += 1
        continue
      }

      if (['PAID', 'WAIVED', 'CANCELLED'].includes(due.status)) {
        skipped.closed += 1
        continue
      }

      if (due.is_cam_advance_covered) {
        skipped.covered += 1
        continue
      }

      if (body.dueDate < due.billing_period_start_date) {
        skipped.beforePeriodStart += 1
        continue
      }

      if (body.dueDate === due.due_date) {
        unchangedRows.push(due)
        continue
      }

      const paidAmount = Number(due.paid_amount)
      const computed = computeDueAmounts(
        {
          dueDate: body.dueDate,
          baseAmount: Number(due.base_amount),
          paidAmount,
          waivedAmount: Number(due.waived_amount),
          storedStatus: due.status,
        },
        today,
        settings.graceDays,
        settings.lateFeePerDay,
      )

      if (computed.totalAmount < paidAmount) {
        skipped.paymentConflict += 1
        continue
      }

      updatePayload.push({
        id: due.id,
        dueDate: body.dueDate,
        lateFeeAmount: computed.lateFeeAmount,
        totalAmount: computed.totalAmount,
        balanceAmount: computed.balanceAmount,
        status: computed.status,
      })
    }

    if (updatePayload.length > 0) {
      await client.query(
        `
          update maintenance_dues md
          set
            due_date = payload.due_date,
            late_fee_amount = payload.late_fee_amount,
            total_amount = payload.total_amount,
            balance_amount = payload.balance_amount,
            status = payload.status::due_status,
            updated_at = now()
          from jsonb_to_recordset($1::jsonb) as payload(
            id uuid,
            due_date date,
            late_fee_amount numeric,
            total_amount numeric,
            balance_amount numeric,
            status text
          )
          where md.id = payload.id
            and md.society_id = $2
        `,
        [
          JSON.stringify(updatePayload.map((due) => ({
            id: due.id,
            due_date: due.dueDate,
            late_fee_amount: due.lateFeeAmount,
            total_amount: due.totalAmount,
            balance_amount: due.balanceAmount,
            status: due.status,
          }))),
          authMe.user.societyId,
        ],
      )

      const affectedUsers = await client.query<{
        user_id: string
        billing_period_id: string
      }>(
        `
          select distinct fr.user_id, md.billing_period_id
          from maintenance_dues md
          inner join flat_residents fr on fr.flat_id = md.flat_id
          where md.id = any($1::uuid[])
            and md.society_id = $2
            and fr.is_active = true
        `,
        [updatePayload.map((due) => due.id), authMe.user.societyId],
      )

      const accessResult = await recomputeUserAccessForPairs(
        client,
        affectedUsers.rows.map((user) => ({
          userId: user.user_id,
          billingPeriodId: user.billing_period_id,
        })),
      )
      accessRecomputed = accessResult.recomputed
      accessRevoked = accessResult.revoked
    }

    const eligible = updatePayload.length + unchangedRows.length

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'UPDATED',
      eventKey: 'maintenance_due.bulk_due_date_updated',
      beforeState: {
        dueDateCounts: previousDueDateCounts,
      },
      afterState: {
        dueDate: body.dueDate,
        note: body.note ?? null,
      },
      metadata: {
        requestedDueCount,
        matchedDueCount: dueResult.rows.length,
        eligibleDueCount: eligible,
        updatedDueCount: updatePayload.length,
        unchangedDueCount: unchangedRows.length,
        selectionSource,
        filters: body.filters ?? null,
        skipped,
        note: body.note ?? null,
        accessRecomputedCount: accessRecomputed,
        accessRevokedCount: accessRevoked,
      },
      relatedEntities: [
        {
          entityTable: 'society_profile',
          entityId: authMe.user.societyId,
          entityLabel: 'AJOWA',
        },
      ],
    })

    await client.query('commit')

    return createApiSuccess(event, {
      dueDate: body.dueDate,
      requested: requestedDueCount,
      matched: dueResult.rows.length,
      eligible,
      updated: updatePayload.length,
      unchanged: unchangedRows.length,
      skippedNotFound: skipped.notFound,
      skippedLocked: skipped.locked,
      skippedClosed: skipped.closed,
      skippedCovered: skipped.covered,
      skippedBeforePeriodStart: skipped.beforePeriodStart,
      skippedPaymentConflict: skipped.paymentConflict,
      accessRecomputed,
      accessRevoked,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
