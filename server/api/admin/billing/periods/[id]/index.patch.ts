import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { validatePayload, writeMasterAudit, readUuidParam } from '~/server/utils/master-data'
import { billingPeriodUpdateSchema, type BillingPeriodUpdateInput } from '~/server/utils/billing'
import { AppError } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const periodId = readUuidParam(event, 'id')
  const body = validatePayload<BillingPeriodUpdateInput>(billingPeriodUpdateSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const existing = await client.query<{
      id: string; label: string; is_locked: boolean; start_date: string; end_date: string; due_date: string
    }>(
      `select id, label, is_locked, start_date::text, end_date::text, due_date::text from billing_periods where id = $1 and society_id = $2`,
      [periodId, authMe.user.societyId],
    )

    if (!existing.rows[0]) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Billing period not found.',
      })
    }

    const current = existing.rows[0]

    // Lock/unlock logic
    if (body.isLocked !== undefined && body.isLocked !== current.is_locked) {
      if (body.isLocked && !body.lockReason) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'A lock reason is required when locking a period.',
        })
      }

      await client.query(
        `
          update billing_periods
          set is_locked = $1, locked_at = $3, lock_reason = $4, updated_at = now()
          where id = $2
        `,
        [body.isLocked, periodId, body.isLocked ? new Date().toISOString() : null, body.lockReason ?? null],
      )

      await writeMasterAudit({
        client,
        event,
        actorUserId: authMe.user.id,
        actorAuthUserId: authMe.authUser.id,
        action: 'STATE_CHANGED',
        eventKey: body.isLocked ? 'billing_periods.locked' : 'billing_periods.unlocked',
        beforeState: { isLocked: current.is_locked },
        afterState: { isLocked: body.isLocked, lockReason: body.lockReason },
        relatedEntities: [
          { entityTable: 'billing_periods', entityId: periodId, entityLabel: current.label },
        ],
      })
    }

    // Update metadata fields
    const updates: string[] = []
    const values: unknown[] = []
    let idx = 1

    if (body.label !== undefined) {
      updates.push(`label = $${idx++}`)
      values.push(body.label)
    }
    if (body.frequency !== undefined) {
      updates.push(`frequency = $${idx++}`)
      values.push(body.frequency)
    }
    if (body.startDate !== undefined) {
      updates.push(`start_date = $${idx++}`)
      values.push(body.startDate)
    }
    if (body.endDate !== undefined) {
      updates.push(`end_date = $${idx++}`)
      values.push(body.endDate)
    }
    if (body.dueDate !== undefined) {
      updates.push(`due_date = $${idx++}`)
      values.push(body.dueDate)
    }

    if (updates.length > 0) {
      updates.push('updated_at = now()')
      values.push(periodId, authMe.user.societyId)

      await client.query(
        `
          update billing_periods set ${updates.join(', ')}
          where id = $${idx++} and society_id = $${idx++}
        `,
        values,
      )

      await writeMasterAudit({
        client,
        event,
        actorUserId: authMe.user.id,
        actorAuthUserId: authMe.authUser.id,
        action: 'UPDATED',
        eventKey: 'billing_periods.updated',
        beforeState: {
          label: current.label,
        },
        afterState: body as unknown as Record<string, unknown>,
        relatedEntities: [
          { entityTable: 'billing_periods', entityId: periodId, entityLabel: current.label },
        ],
      })
    }

    await client.query('commit')
    return createApiSuccess(event, { id: periodId })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})