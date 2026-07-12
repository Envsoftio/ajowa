import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { camAdvanceCoverageSchema } from '~/server/utils/cam-advance'
import { recomputeFlatAccessForActiveBillingPeriods } from '~/server/utils/qr-access'
import { readUuidParam, validatePayload, writeMasterAudit } from '~/server/utils/master-data'

type CoverageBeforeRow = {
  id: string
  flat_id: string
  flat_label: string
  covered_from: string
  covered_until: string
  amount: string | null
  source: string
  reference: string | null
  notes: string | null
  is_active: boolean
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const body = validatePayload(camAdvanceCoverageSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const beforeResult = await client.query<CoverageBeforeRow>(
      `
        select
          cac.id,
          cac.flat_id,
          concat(b.name, ' ', f.flat_number) as flat_label,
          cac.covered_from::text,
          cac.covered_until::text,
          cac.amount::text,
          cac.source,
          cac.reference,
          cac.notes,
          cac.is_active
        from cam_advance_coverages cac
        inner join flats f on f.id = cac.flat_id
        inner join blocks b on b.id = f.block_id
        where cac.id = $1 and cac.society_id = $2
        limit 1
      `,
      [id, authMe.user.societyId],
    )
    const flatResult = await client.query<{ id: string; label: string }>(
      `
        select f.id, concat(b.name, ' ', f.flat_number) as label
        from flats f
        inner join blocks b on b.id = f.block_id
        where f.id = $1 and f.society_id = $2
        limit 1
      `,
      [body.flatId, authMe.user.societyId],
    )

    const before = beforeResult.rows[0]
    if (!before) {
      throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'CAM advance coverage not found.' })
    }
    const flat = flatResult.rows[0]
    if (!flat) {
      throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Flat not found.' })
    }

    await client.query(
      `
        update cam_advance_coverages
        set
          flat_id = $3,
          covered_from = $4::date,
          covered_until = $5::date,
          amount = $6,
          source = $7,
          reference = $8,
          notes = $9,
          is_active = $10,
          updated_by_user_id = $11,
          updated_at = now()
        where id = $1 and society_id = $2
      `,
      [
        id,
        authMe.user.societyId,
        body.flatId,
        body.coveredFrom,
        body.coveredUntil,
        body.amount ?? null,
        body.source,
        body.reference ?? null,
        body.notes ?? null,
        body.isActive,
        authMe.user.id,
      ],
    )

    if (before.is_active || body.isActive) {
      await recomputeFlatAccessForActiveBillingPeriods(
        client,
        authMe.user.societyId,
        [before.flat_id, body.flatId],
      )
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: body.isActive ? 'UPDATED' : 'STATE_CHANGED',
      eventKey: 'cam_advance_coverage.updated',
      beforeState: {
        flatId: before.flat_id,
        coveredFrom: before.covered_from,
        coveredUntil: before.covered_until,
        amount: before.amount == null ? null : Number(before.amount),
        source: before.source,
        reference: before.reference,
        notes: before.notes,
        isActive: before.is_active,
      },
      afterState: body,
      relatedEntities: [{ entityTable: 'flats', entityId: body.flatId, entityLabel: flat.label }],
    })

    await client.query('commit')
    return createApiSuccess(event, { id, updated: true })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
