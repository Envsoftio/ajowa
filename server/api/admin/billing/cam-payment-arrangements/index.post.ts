import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import {
  camPaymentArrangementSchema,
  syncCamPaymentArrangementDues,
  type CamPaymentArrangementInput,
} from '~/server/utils/cam-payment-arrangements'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import {
  normalizeSocietySettings,
  validatePayload,
  writeMasterAudit,
} from '~/server/utils/master-data'
import { recomputeFlatAccessForActiveBillingPeriods } from '~/server/utils/qr-access'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validatePayload<CamPaymentArrangementInput>(
    camPaymentArrangementSchema,
    await readJsonBody(event),
  )
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const flatResult = await client.query<{ id: string; label: string }>(
      `
        select f.id, concat(b.name, ' ', f.flat_number) as label
        from flats f
        inner join blocks b on b.id = f.block_id
        where f.id = $1
          and f.society_id = $2
          and f.is_active = true
        limit 1
      `,
      [body.flatId, authMe.user.societyId],
    )
    const flat = flatResult.rows[0]
    if (!flat) {
      throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Flat not found.' })
    }

    if (body.isActive && !body.effectiveUntil) {
      const existingOpen = await client.query<{ id: string }>(
        `
          select id
          from cam_payment_arrangements
          where society_id = $1
            and flat_id = $2
            and is_active = true
            and revoked_at is null
            and effective_until is null
          limit 1
        `,
        [authMe.user.societyId, body.flatId],
      )
      if (existingOpen.rows[0]) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'This flat already has an active open-ended CAM payment arrangement. Edit or revoke it before adding another.',
        })
      }
    }

    const result = await client.query<{ id: string }>(
      `
        insert into cam_payment_arrangements (
          society_id,
          flat_id,
          penalty_free_until_day,
          effective_from,
          effective_until,
          reason,
          reference,
          approved_by_user_id,
          is_active
        )
        values ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9)
        returning id
      `,
      [
        authMe.user.societyId,
        body.flatId,
        body.penaltyFreeUntilDay,
        body.effectiveFrom,
        body.effectiveUntil ?? null,
        body.reason,
        body.reference ?? null,
        authMe.user.id,
        body.isActive,
      ],
    )

    const id = result.rows[0]?.id
    if (!id) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'CAM payment arrangement creation did not return an identifier.',
      })
    }

    const settingsResult = await client.query<{ settings: Record<string, unknown> }>(
      `select settings from society_profile where id = $1 limit 1`,
      [authMe.user.societyId],
    )
    const settings = normalizeSocietySettings(settingsResult.rows[0]?.settings)
    const syncResult = body.isActive
      ? await syncCamPaymentArrangementDues(client, {
          societyId: authMe.user.societyId,
          flatIds: [body.flatId],
          graceDays: settings.graceDays,
          lateFeePerDay: settings.lateFeePerDay,
        })
      : { matched: 0, updated: 0 }

    if (syncResult.updated > 0) {
      await recomputeFlatAccessForActiveBillingPeriods(
        client,
        authMe.user.societyId,
        [body.flatId],
      )
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'cam_payment_arrangement.created',
      afterState: body,
      metadata: {
        syncedDueCount: syncResult.updated,
      },
      relatedEntities: [{ entityTable: 'flats', entityId: body.flatId, entityLabel: flat.label }],
    })

    await client.query('commit')
    return createApiSuccess(event, {
      id,
      syncedDueCount: syncResult.updated,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
