import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { camAdvanceCoverageSchema } from '~/server/utils/cam-advance'
import { validatePayload, writeMasterAudit } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validatePayload(camAdvanceCoverageSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

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
    const flat = flatResult.rows[0]
    if (!flat) {
      throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Flat not found.' })
    }

    const result = await client.query<{ id: string }>(
      `
        insert into cam_advance_coverages (
          society_id,
          flat_id,
          covered_from,
          covered_until,
          amount,
          source,
          reference,
          notes,
          is_active,
          created_by_user_id,
          updated_by_user_id
        )
        values ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, $10, $10)
        returning id
      `,
      [
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

    const id = result.rows[0]?.id
    if (!id) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'CAM advance coverage creation did not return an identifier.',
      })
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'cam_advance_coverage.created',
      afterState: body,
      relatedEntities: [{ entityTable: 'flats', entityId: body.flatId, entityLabel: flat.label }],
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
