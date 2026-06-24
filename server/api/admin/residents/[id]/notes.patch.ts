import { z } from 'zod'
import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam, writeMasterAudit } from '~/server/utils/master-data'

const residentNotesSchema = z.object({
  adminNotes: z.string().max(10000).nullable().optional(),
})

type ResidentNotesRow = {
  full_name: string
  admin_notes: string | null
}

const normalizeAdminNotes = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed : null
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const body = validateInput(residentNotesSchema, await readJsonBody(event))
  const adminNotes = normalizeAdminNotes(body.adminNotes)
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const beforeResult = await client.query<ResidentNotesRow>(
      `
        select full_name, admin_notes
        from users
        where id = $1 and society_id = $2 and role = 'RESIDENT'
        limit 1
      `,
      [id, authMe.user.societyId],
    )
    const before = beforeResult.rows[0]

    if (!before) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Resident not found.',
      })
    }

    if (normalizeAdminNotes(before.admin_notes) === adminNotes) {
      await client.query('commit')
      return createApiSuccess(event, {
        id,
        adminNotes,
        updated: false,
      })
    }

    const updatedResult = await client.query<{
      admin_notes: string | null
      updated_at: string
    }>(
      `
        update users
        set admin_notes = $3, updated_at = now()
        where id = $1 and society_id = $2 and role = 'RESIDENT'
        returning admin_notes, updated_at::text
      `,
      [id, authMe.user.societyId, adminNotes],
    )
    const updated = updatedResult.rows[0]

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'UPDATED',
      eventKey: 'residents.notes.updated',
      beforeState: { adminNotes: before.admin_notes },
      afterState: { adminNotes: updated?.admin_notes ?? null },
      relatedEntities: [
        { entityTable: 'users', entityId: id, entityLabel: before.full_name },
      ],
      targetUserId: id,
    })

    await client.query('commit')
    return createApiSuccess(event, {
      id,
      adminNotes: updated?.admin_notes ?? null,
      updatedAt: updated?.updated_at ?? null,
      updated: true,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
