import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { validatePayload, writeMasterAudit } from '~/server/utils/master-data'
import { billingPeriodSchema, type BillingPeriodInput } from '~/server/utils/billing'
import { AppError } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validatePayload<BillingPeriodInput>(billingPeriodSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    if (body.startDate > body.endDate) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Start date must be before or equal to end date.',
      })
    }

    if (body.dueDate < body.startDate) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Due date must be on or after start date.',
      })
    }

    const duplicate = await client.query<{ id: string; label: string }>(
      `
        select id, label
        from billing_periods
        where society_id = $1
          and charge_type = $2
          and start_date = $3
          and end_date = $4
        limit 1
      `,
      [authMe.user.societyId, body.chargeType, body.startDate, body.endDate],
    )

    if (duplicate.rows[0]) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: `A ${body.chargeType} period already exists for this exact date range as "${duplicate.rows[0].label}".`,
      })
    }

    const result = await client.query<{ id: string }>(
      `
        insert into billing_periods (society_id, label, frequency, charge_type, start_date, end_date, due_date)
        values ($1, $2, $3, $4, $5, $6, $7)
        returning id
      `,
      [
        authMe.user.societyId,
        body.label,
        body.frequency,
        body.chargeType,
        body.startDate,
        body.endDate,
        body.dueDate,
      ],
    )

    const id = result.rows[0]?.id

    if (!id) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Billing period creation did not return an identifier.',
      })
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'billing_periods.created',
      afterState: body as unknown as Record<string, unknown>,
      relatedEntities: [
        { entityTable: 'billing_periods', entityId: id, entityLabel: body.label },
      ],
    })

    await client.query('commit')
    return createApiSuccess(event, { id })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
