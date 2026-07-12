import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import {
  professionSchema,
  validatePayload,
  writeMasterAudit,
} from '~/server/utils/master-data'

type PgError = Error & {
  code?: string
  constraint?: string
}

const isPgError = (error: unknown): error is PgError =>
  error instanceof Error && 'code' in error

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validatePayload(professionSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')
    const result = await client.query<{ id: string }>(
      `
        insert into professions (
          society_id,
          name,
          description,
          sort_order,
          is_active,
          is_public_allowed
        )
        values ($1, $2, $3, $4, $5, $6)
        returning id
      `,
      [
        authMe.user.societyId,
        body.name,
        body.description ?? null,
        body.sortOrder,
        body.isActive,
        body.isPublicAllowed,
      ],
    )
    const id = result.rows[0]?.id

    if (!id) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Profession creation did not return an identifier.',
      })
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'professions.created',
      afterState: body,
      relatedEntities: [
        { entityTable: 'professions', entityId: id, entityLabel: body.name },
      ],
    })

    await client.query('commit')
    return createApiSuccess(event, { id })
  } catch (error) {
    await client.query('rollback')

    if (isPgError(error) && error.code === '23505') {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'A profession with this name already exists.',
      })
    }

    throw error
  } finally {
    client.release()
  }
})
