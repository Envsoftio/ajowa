import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import {
  assignInviteRelationships,
  createCredentialUser,
  getInvitePreview,
  hashInviteToken,
  isEmailVerificationRequiredForRole,
  sendVerificationEmailToUser,
} from '~/server/utils/auth'
import { AppError } from '~/server/utils/errors'
import { passwordPolicySatisfied } from '~/shared/auth'
import { getDatabasePool } from '~/server/utils/database'

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  fullName: z.string().trim().min(2),
  mobileNumber: z.string().trim().min(8),
  whatsappNumber: z.string().trim().min(8).optional().or(z.literal('')),
  password: z.string().min(12),
})

type InviteAssignmentRow = {
  id: string
  email: string
  role: 'ADMIN' | 'MANAGER' | 'SERVICE_STAFF' | 'RESIDENT' | 'GUARD'
  relationship_type: 'OWNER' | 'TENANT' | 'FAMILY_MEMBER' | null
  access_scope: 'OWNERSHIP' | 'TENANCY' | 'HOUSEHOLD' | null
  flat_ids: string[]
  department_ids: string[]
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
}

export default defineEventHandler(async (event) => {
  const body = validateInput(acceptInviteSchema, await readJsonBody(event))

  if (!passwordPolicySatisfied(body.password)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Password does not satisfy the AJOWA policy.',
    })
  }

  const preview = await getInvitePreview(body.token)

  if (!preview) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'This invite is invalid or no longer available.',
    })
  }

  if (preview.status !== 'PENDING') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'This invite is no longer active.',
    })
  }

  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const inviteResult = await client.query<InviteAssignmentRow>(
      `
        select
          id,
          email,
          role,
          relationship_type,
          access_scope,
          flat_ids::text[],
          department_ids::text[],
          expires_at::text,
          accepted_at::text,
          revoked_at::text
        from auth_invites
        where token_hash = $1
        limit 1
      `,
      [hashInviteToken(body.token)],
    )

    const invite = inviteResult.rows[0]

    if (!invite || invite.accepted_at || invite.revoked_at || new Date(invite.expires_at).getTime() <= Date.now()) {
      throw new AppError({
        code: 'FORBIDDEN',
        statusCode: 403,
        message: 'This invite is no longer active.',
      })
    }

    const requiresEmailVerification = isEmailVerificationRequiredForRole(invite.role)

    const createdUser = await createCredentialUser({
      client,
      email: invite.email,
      fullName: body.fullName,
      password: body.password,
      mobileNumber: body.mobileNumber,
      whatsappNumber: body.whatsappNumber || body.mobileNumber,
      role: invite.role,
      emailVerified: !requiresEmailVerification,
      mustChangePassword: false,
    })

    await assignInviteRelationships({
      client,
      authUserId: createdUser.authUserId,
      role: invite.role,
      flatIds: invite.flat_ids ?? [],
      relationshipType: invite.relationship_type,
      accessScope: invite.access_scope,
      departmentIds: invite.department_ids ?? [],
    })

    await client.query(
      `
        update auth_invites
        set accepted_at = now(),
            accepted_by_auth_user_id = $2,
            updated_at = now()
        where id = $1
      `,
      [invite.id, createdUser.authUserId],
    )

    await client.query('commit')

    if (requiresEmailVerification) {
      await sendVerificationEmailToUser({
        id: createdUser.authUserId,
        email: createdUser.email,
        name: createdUser.fullName,
      })
    }

    return createApiSuccess(event, {
      email: createdUser.email,
      requiresEmailVerification,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
