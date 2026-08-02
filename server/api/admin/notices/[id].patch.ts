import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'

const audienceSchema = z.object({
  scope: z.enum([
    'ALL_ACTIVE_RESIDENTS',
    'ACTIVE_PUSH_SUBSCRIBERS',
    'BLOCKS',
    'FLATS',
    'USERS',
    'OWNERS',
    'OWNER_OF_FLAT',
    'TENANTS',
    'DEFAULTERS',
    'BILLING_CONTACTS',
  ]),
  userIds: z.array(z.string().uuid()).optional(),
  blockIds: z.array(z.string().uuid()).optional(),
  flatIds: z.array(z.string().uuid()).optional(),
}).superRefine((audience, ctx) => {
  if (audience.scope === 'OWNER_OF_FLAT' && audience.flatIds?.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['flatIds'],
      message: 'Select exactly one flat owner.',
    })
  }
})

const schema = z.object({
  title: z.string().min(3).max(180).optional(),
  summary: z.string().max(500).nullable().optional(),
  body: z.string().min(3).max(12000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isPinned: z.boolean().optional(),
  audience: audienceSchema.optional(),
  attachmentLabel: z.string().max(180).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = getRouterParam(event, 'id')
  const body = validateInput(schema, await readJsonBody(event))

  const result = await queryRows<{ id: string }>(
    `
      update notices
      set title = coalesce($3, title),
          summary = case when $4 then $5 else summary end,
          body = coalesce($6, body),
          priority = coalesce($7, priority),
          expires_at = case when $8 then $9::timestamptz else expires_at end,
          is_pinned = coalesce($10, is_pinned),
          audience_scope = coalesce($11, audience_scope),
          audience_filter = case when $12 then $13::jsonb else audience_filter end,
          attachment_label = case when $14 then $15 else attachment_label end,
          updated_at = now()
      where id = $1
        and society_id = $2
        and status = 'DRAFT'
      returning id
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
      body.audience?.scope ?? null,
      Object.prototype.hasOwnProperty.call(body, 'audience'),
      body.audience ? JSON.stringify(body.audience) : null,
      Object.prototype.hasOwnProperty.call(body, 'attachmentLabel'),
      body.attachmentLabel ?? null,
    ],
  )

  if (!result.rows[0]) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'Only draft notices can be edited. Refresh the list and try again.',
    })
  }

  return createApiSuccess(event, { id })
})
