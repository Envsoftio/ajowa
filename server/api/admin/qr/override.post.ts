import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { accessOverrideSchema, recomputeUserAccess, revokeActiveQr } from '~/server/utils/qr-access'
import { writeMasterAudit } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN'])
  const body = validateInput(accessOverrideSchema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const access = await recomputeUserAccess(body.userId, body.billingPeriodId, client)
    if (!access || access.society_id !== authMe.user.societyId) {
      throw new AppError({ code: 'FORBIDDEN', statusCode: 403, message: 'Cannot override another society.' })
    }

    const updated = await client.query(
      `
        update user_access_status
        set override_state = $3,
            override_reason = $4,
            override_by_user_id = $5,
            override_at = now(),
            override_expires_at = $6,
            is_access_granted = $3 = 'GRANTED',
            updated_at = now()
        where user_id = $1 and billing_period_id = $2
        returning id, is_access_granted
      `,
      [body.userId, body.billingPeriodId, body.state, body.reason, authMe.user.id, body.expiresAt ?? null],
    )

    if (body.state === 'BLOCKED') {
      await revokeActiveQr(client, body.userId, body.billingPeriodId, body.reason)
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'STATE_CHANGED',
      eventKey: 'access.override.changed',
      metadata: {
        userId: body.userId,
        billingPeriodId: body.billingPeriodId,
        state: body.state,
        reason: body.reason,
        expiresAt: body.expiresAt ?? null,
      },
      relatedEntities: [
        {
          entityTable: 'user_access_status',
          entityId: updated.rows[0].id,
          entityLabel: `Access override ${body.state}`,
        },
      ],
    })

    await client.query('commit')
    return createApiSuccess(event, {
      id: updated.rows[0].id,
      isGranted: updated.rows[0].is_access_granted,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
