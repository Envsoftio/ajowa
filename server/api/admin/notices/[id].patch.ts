import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'

const schema = z.object({
  title: z.string().min(3).max(180).optional(),
  summary: z.string().max(500).nullable().optional(),
  body: z.string().min(3).max(12000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isPinned: z.boolean().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED', 'CANCELLED']).optional(),
  attachmentLabel: z.string().max(180).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = getRouterParam(event, 'id')
  const body = validateInput(schema, await readJsonBody(event))

  await queryRows(
    `
      update notices
      set title = coalesce($3, title),
          summary = case when $4 then $5 else summary end,
          body = coalesce($6, body),
          priority = coalesce($7, priority),
          expires_at = case when $8 then $9::timestamptz else expires_at end,
          is_pinned = coalesce($10, is_pinned),
          status = coalesce($11, status),
          attachment_label = case when $12 then $13 else attachment_label end,
          updated_at = now()
      where id = $1 and society_id = $2
    `,
    [
      id,
      authMe.user.societyId,
      body.title ?? null,
      Object.prototype.hasOwnProperty.call(body, 'summary'),
      body.summary ?? null,
      body.body ?? null,
      body.priority ?? null,
      Object.prototype.hasOwnProperty.call(body, 'expiresAt'),
      body.expiresAt ?? null,
      body.isPinned ?? null,
      body.status ?? null,
      Object.prototype.hasOwnProperty.call(body, 'attachmentLabel'),
      body.attachmentLabel ?? null,
    ],
  )

  return createApiSuccess(event, { id })
})
