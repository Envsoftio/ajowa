import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import {
  professionSchema,
  readUuidParam,
  validatePayload,
  writeMasterAudit,
} from '~/server/utils/master-data'

type ProfessionRow = {
  id: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
  is_public_allowed: boolean
}

type PgError = Error & {
  code?: string
  constraint?: string
}

const isPgError = (error: unknown): error is PgError =>
  error instanceof Error && 'code' in error

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const body = validatePayload(professionSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')
    const beforeResult = await client.query<ProfessionRow>(
      `
        select id, name, description, sort_order, is_active, is_public_allowed
        from professions
        where id = $1 and society_id = $2
        limit 1
      `,
      [id, authMe.user.societyId],
    )
    const before = beforeResult.rows[0]

    if (!before) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Profession not found.',
      })
    }

    await client.query(
      `
        update professions
        set
          name = $3,
          description = $4,
          sort_order = $5,
          is_active = $6,
          is_public_allowed = $7,
          updated_at = now()
        where id = $1 and society_id = $2
      `,
      [
        id,
        authMe.user.societyId,
        body.name,
        body.description ?? null,
        body.sortOrder,
        body.isActive,
        body.isPublicAllowed,
      ],
    )

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action:
        before.is_active !== body.isActive ||
        before.is_public_allowed !== body.isPublicAllowed
          ? 'STATE_CHANGED'
          : 'UPDATED',
      eventKey: 'professions.updated',
      beforeState: {
        name: before.name,
        description: before.description,
        sortOrder: before.sort_order,
        isActive: before.is_active,
        isPublicAllowed: before.is_public_allowed,
      },
      afterState: body,
      relatedEntities: [
        { entityTable: 'professions', entityId: id, entityLabel: body.name },
      ],
    })

    await client.query('commit')
    return createApiSuccess(event, { id, updated: true })
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
