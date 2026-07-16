import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { syncCamPaymentArrangementDues } from '~/server/utils/cam-payment-arrangements'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import {
  normalizeSocietySettings,
  readUuidParam,
  writeMasterAudit,
} from '~/server/utils/master-data'
import { recomputeFlatAccessForActiveBillingPeriods } from '~/server/utils/qr-access'

type ArrangementDeleteRow = {
  id: string
  flat_id: string
  flat_label: string
  is_active: boolean
  revoked_at: string | null
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const arrangementId = readUuidParam(event, 'id')
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const currentResult = await client.query<ArrangementDeleteRow>(
      `
        select
          cpa.id,
          cpa.flat_id,
          concat(b.name, ' ', f.flat_number) as flat_label,
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

    await client.query(
      `
        update cam_payment_arrangements
        set
          is_active = false,
          revoked_by_user_id = coalesce(revoked_by_user_id, $3),
          revoked_at = coalesce(revoked_at, now()),
          updated_at = now()
        where id = $1
          and society_id = $2
      `,
      [arrangementId, authMe.user.societyId, authMe.user.id],
    )

    const settingsResult = await client.query<{ settings: Record<string, unknown> }>(
      `select settings from society_profile where id = $1 limit 1`,
      [authMe.user.societyId],
    )
    const settings = normalizeSocietySettings(settingsResult.rows[0]?.settings)
    const syncResult = await syncCamPaymentArrangementDues(client, {
      societyId: authMe.user.societyId,
      flatIds: [current.flat_id],
      graceDays: settings.graceDays,
      lateFeePerDay: settings.lateFeePerDay,
    })

    if (syncResult.updated > 0) {
      await recomputeFlatAccessForActiveBillingPeriods(
        client,
        authMe.user.societyId,
        [current.flat_id],
      )
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'DELETED',
      eventKey: 'cam_payment_arrangement.revoked',
      beforeState: current,
      metadata: {
        syncedDueCount: syncResult.updated,
      },
      relatedEntities: [{ entityTable: 'flats', entityId: current.flat_id, entityLabel: current.flat_label }],
    })

    await client.query('commit')
    return createApiSuccess(event, {
      id: arrangementId,
      deleted: true,
      syncedDueCount: syncResult.updated,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
