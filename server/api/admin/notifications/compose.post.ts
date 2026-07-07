import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { enqueueNotificationForAudience } from '~/server/utils/notifications'

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
  title: z.string().min(3).max(180),
  body: z.string().min(3).max(4000),
  category: z.enum([
    'BILLING',
    'PAYMENTS',
    'ACCESS_QR',
    'SERVICE_REQUESTS',
    'AMENITY_BOOKINGS',
    'NOTICES_ANNOUNCEMENTS',
    'ACCOUNT_ONBOARDING',
    'EMERGENCY_ALERTS',
  ]).default('NOTICES_ANNOUNCEMENTS'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']).default('MEDIUM'),
  channels: z.array(z.enum(['PUSH', 'EMAIL', 'WHATSAPP', 'IN_APP'])).min(1),
  audience: audienceSchema,
  scheduleFor: z.string().datetime().nullable().optional(),
  draft: z.boolean().default(false),
  attachmentReference: z.string().max(500).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validateInput(schema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const queued = body.draft
      ? { eventId: null, audienceCount: 0, jobCount: 0 }
      : await enqueueNotificationForAudience(client, {
          societyId: authMe.user.societyId,
          eventKey: 'manual.broadcast',
          category: body.category,
          priority: body.priority,
          title: body.title,
          body: body.body,
          payload: {
            deepLinkUrl: '/my/notifications',
            attachmentReference: body.attachmentReference ?? null,
          },
          idempotencyKey: `manual.broadcast:${authMe.user.id}:${Date.now()}`,
          triggeredByUserId: authMe.user.id,
          channels: body.channels,
          audience: body.audience,
          audienceLabel: body.audience.scope,
          scheduledFor: body.scheduleFor ?? null,
        })
    await client.query('commit')

    return createApiSuccess(event, { draft: body.draft, ...queued, dispatch: null })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
