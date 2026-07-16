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
  readUuidParam,
  validatePayload,
  writeMasterAudit,
} from '~/server/utils/master-data'
import { recomputeFlatAccessForActiveBillingPeriods } from '~/server/utils/qr-access'

type ArrangementEditRow = {
  id: string
  flat_id: string
  flat_label: string
  penalty_free_until_day: number
  effective_from: string
  effective_until: string | null
  reason: string
  reference: string | null
  is_active: boolean
  revoked_at: string | null
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const arrangementId = readUuidParam(event, 'id')
  const body = validatePayload<CamPaymentArrangementInput>(
    camPaymentArrangementSchema,
    await readJsonBody(event),
  )
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const currentResult = await client.query<ArrangementEditRow>(
      `
        select
          cpa.id,
          cpa.flat_id,
          concat(b.name, ' ', f.flat_number) as flat_label,
          cpa.penalty_free_until_day,
          cpa.effective_from::text,
          cpa.effective_until::text,
          cpa.reason,
          cpa.reference,
          cpa.is_active,
          cpa.revoked_at::text
        from cam_payment_arrangements cpa
        inner join flats f on f.id = cpa.flat_id
        inner join blocks b on b.id = f.block_id
        where cpa.id = $1
          and cpa.society_id = $2
        limit 1
        for update of cpa
      `,
      [arrangementId, authMe.user.societyId],
    )
    const current = currentResult.rows[0]
    if (!current) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'CAM payment arrangement not found.',
      })
    }

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
            and id <> $3
            and is_active = true
            and revoked_at is null
            and effective_until is null
          limit 1
        `,
        [authMe.user.societyId, body.flatId, arrangementId],
      )
      if (existingOpen.rows[0]) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'This flat already has another active open-ended CAM payment arrangement.',
        })
      }
    }

    await client.query(
      `
        update cam_payment_arrangements
        set
          flat_id = $2,
          penalty_free_until_day = $3,
          effective_from = $4::date,
          effective_until = $5::date,
          reason = $6,
          reference = $7,
          is_active = $8,
          revoked_by_user_id = case when $8 then null else coalesce(revoked_by_user_id, $9) end,
          revoked_at = case when $8 then null else coalesce(revoked_at, now()) end,
          updated_at = now()
        where id = $1
          and society_id = $10
      `,
      [
        arrangementId,
        body.flatId,
        body.penaltyFreeUntilDay,
        body.effectiveFrom,
        body.effectiveUntil ?? null,
        body.reason,
        body.reference ?? null,
        body.isActive,
        authMe.user.id,
        authMe.user.societyId,
      ],
    )

    const settingsResult = await client.query<{ settings: Record<string, unknown> }>(
      `select settings from society_profile where id = $1 limit 1`,
      [authMe.user.societyId],
    )
    const settings = normalizeSocietySettings(settingsResult.rows[0]?.settings)
    const affectedFlatIds = [...new Set([current.flat_id, body.flatId])]
    const syncResult = await syncCamPaymentArrangementDues(client, {
      societyId: authMe.user.societyId,
      flatIds: affectedFlatIds,
      graceDays: settings.graceDays,
      lateFeePerDay: settings.lateFeePerDay,
    })

    if (syncResult.updated > 0) {
      await recomputeFlatAccessForActiveBillingPeriods(
        client,
        authMe.user.societyId,
        affectedFlatIds,
      )
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'UPDATED',
      eventKey: 'cam_payment_arrangement.updated',
      beforeState: current,
      afterState: body,
      metadata: {
        syncedDueCount: syncResult.updated,
      },
      relatedEntities: [{ entityTable: 'flats', entityId: body.flatId, entityLabel: flat.label }],
    })

    await client.query('commit')
    return createApiSuccess(event, {
      id: arrangementId,
      syncedDueCount: syncResult.updated,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
