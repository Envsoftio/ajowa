import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import {
  createInviteToken,
  requireRole,
} from '~/server/utils/auth'
import { sendTemplatedEmail, buildAppUrl } from '~/server/utils/email'
import { getDatabasePool } from '~/server/utils/database'

const schema = z.object({
  email: z.string().trim().email(),
  role: z.enum(['ADMIN', 'MANAGER', 'SERVICE_STAFF', 'RESIDENT', 'GUARD']),
  fullName: z.string().trim().min(2).optional(),
  mobileNumber: z.string().trim().min(8).optional(),
  relationshipType: z.enum(['OWNER', 'TENANT', 'FAMILY_MEMBER']).optional(),
  accessScope: z.enum(['OWNERSHIP', 'TENANCY', 'HOUSEHOLD']).optional(),
  flatIds: z.array(z.string().uuid()).default([]),
  flatLabels: z.array(z.string().min(1)).default([]),
  departmentIds: z.array(z.string().uuid()).default([]),
  departmentNames: z.array(z.string().min(1)).default([]),
  expiresInDays: z.number().int().positive().max(30).default(7),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN'])
  const body = validateInput(schema, await readJsonBody(event))
  const { token, tokenHash } = createInviteToken()
  const pool = getDatabasePool()
  const expiresInDays = body.expiresInDays ?? 7
  const flatLabels = body.flatLabels ?? []
  const departmentNames = body.departmentNames ?? []
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
  const inviteUrl = buildAppUrl('/accept-invite', { token })

  await pool.query(
    `
      insert into auth_invites (
        society_id,
        email,
        role,
        full_name,
        mobile_number,
        relationship_type,
        access_scope,
        flat_ids,
        flat_labels,
        department_ids,
        department_names,
        token_hash,
        invited_by_user_id,
        expires_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::uuid[], $9::text[], $10::uuid[], $11::text[], $12, $13, $14)
    `,
    [
      authMe.user.societyId,
      body.email,
      body.role,
      body.fullName ?? null,
      body.mobileNumber ?? null,
      body.relationshipType ?? null,
      body.accessScope ?? null,
      body.flatIds,
      flatLabels,
      body.departmentIds,
      departmentNames,
      tokenHash,
      authMe.user.id,
      expiresAt.toISOString(),
    ],
  )

  await sendTemplatedEmail({
    to: body.email,
    subject: 'Your AJOWA invite is ready',
    template: 'invite-onboarding',
    context: {
      title: 'Accept your AJOWA invite',
      name: body.fullName ?? body.email,
      actionUrl: inviteUrl,
      expiresLabel: expiresAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
      inviterName: authMe.user.fullName,
      roleLabel: body.role.replace('_', ' ').toLowerCase(),
      details:
        flatLabels.length > 0
          ? `Assigned flats: ${flatLabels.join(', ')}.`
          : departmentNames.length > 0
            ? `Assigned departments: ${departmentNames.join(', ')}.`
            : 'Use the link below to finish onboarding.',
    },
  })

  return createApiSuccess(event, {
    expiresAt: expiresAt.toISOString(),
    inviteUrl,
  })
})
