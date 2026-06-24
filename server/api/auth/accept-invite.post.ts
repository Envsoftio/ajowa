import { z } from 'zod'
import { hashPassword } from 'better-auth/crypto'
import type { PoolClient } from 'pg'
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
import {
  getPasswordPolicyMessage,
  PASSWORD_POLICY,
  passwordPolicySatisfied,
} from '~/shared/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getRequestLogger } from '~/server/utils/logging'

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  fullName: z.string().trim().min(2),
  mobileNumber: z.string().trim().min(8),
  whatsappNumber: z.string().trim().min(8).optional().or(z.literal('')),
  password: z.string().min(
    PASSWORD_POLICY.minLength,
    `Password must be at least ${PASSWORD_POLICY.minLength} characters.`,
  ),
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
  accepted_by_auth_user_id: string | null
  revoked_at: string | null
}

type AcceptedInviteUser = {
  authUserId: string
  email: string
  fullName: string
}

type VerificationEmailDelivery =
  | { delivered: true }
  | { delivered: false; reason: string }

const VERIFICATION_EMAIL_FAILED_REASON =
  'Account was activated, but verification email delivery failed. Ask an admin to resend verification.'

const serializeEmailError = (error: unknown) => {
  if (error instanceof Error) {
    const details = error as Error & {
      code?: unknown
      command?: unknown
      responseCode?: unknown
    }

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: details.code,
      command: details.command,
      responseCode: details.responseCode,
    }
  }

  return { message: String(error) }
}

const acceptExistingCredentialUser = async ({
  client,
  authUserId,
  email,
  fullName,
  mobileNumber,
  whatsappNumber,
  password,
  emailVerified,
}: {
  client: PoolClient
  authUserId: string
  email: string
  fullName: string
  mobileNumber: string
  whatsappNumber: string
  password: string
  emailVerified: boolean
}): Promise<AcceptedInviteUser> => {
  const existingResult = await client.query<{ id: string; user_id: string | null; email: string }>(
    `
      select au.id, au.email::text, u.id as user_id
      from auth_users au
      left join users u on u.auth_user_id = au.id
      where au.id = $1 and au.email = $2
      limit 1
    `,
    [authUserId, email],
  )
  const existing = existingResult.rows[0]

  if (!existing?.id || !existing.user_id) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'This invite is no longer linked to an active account.',
    })
  }

  const passwordHash = await hashPassword(password)

  await client.query(
    `
      update auth_users
      set name = $2,
          email_verified = $3,
          updated_at = now()
      where id = $1
    `,
    [authUserId, fullName, emailVerified],
  )

  await client.query(
    `
      insert into auth_accounts (account_id, provider_id, user_id, password)
      values ($1, 'credential', $1, $2)
      on conflict (provider_id, account_id) do update
        set user_id = excluded.user_id,
            password = excluded.password,
            updated_at = now()
    `,
    [authUserId, passwordHash],
  )

  await client.query(
    `
      update users
      set full_name = $2,
          mobile_number = $3,
          whatsapp_number = $4,
          can_login = true,
          must_change_password = false,
          email_verified = $5,
          updated_at = now()
      where auth_user_id = $1
    `,
    [authUserId, fullName, mobileNumber, whatsappNumber, emailVerified],
  )

  return {
    authUserId,
    email: existing.email,
    fullName,
  }
}

export default defineEventHandler(async (event) => {
  const body = validateInput(acceptInviteSchema, await readJsonBody(event))

  if (!passwordPolicySatisfied(body.password)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        getPasswordPolicyMessage(body.password) ??
        'Password does not satisfy the AJOWA policy.',
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
  let committed = false

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
          accepted_by_auth_user_id::text,
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
    const acceptedUser = invite.accepted_by_auth_user_id
      ? await acceptExistingCredentialUser({
          client,
          authUserId: invite.accepted_by_auth_user_id,
          email: invite.email,
          fullName: body.fullName,
          mobileNumber: body.mobileNumber,
          whatsappNumber: body.whatsappNumber || body.mobileNumber,
          password: body.password,
          emailVerified: !requiresEmailVerification,
        })
      : await createCredentialUser({
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

    if (!invite.accepted_by_auth_user_id) {
      await assignInviteRelationships({
        client,
        authUserId: acceptedUser.authUserId,
        role: invite.role,
        flatIds: invite.flat_ids ?? [],
        relationshipType: invite.relationship_type,
        accessScope: invite.access_scope,
        departmentIds: invite.department_ids ?? [],
      })
    }

    await client.query(
      `
        update auth_invites
        set accepted_at = now(),
            accepted_by_auth_user_id = $2,
            updated_at = now()
        where id = $1
      `,
      [invite.id, acceptedUser.authUserId],
    )

    await client.query('commit')
    committed = true

    let verificationEmailDelivery: VerificationEmailDelivery | null = null
    if (requiresEmailVerification) {
      try {
        const verificationEmail = await sendVerificationEmailToUser({
          id: acceptedUser.authUserId,
          email: acceptedUser.email,
          name: acceptedUser.fullName,
        })

        if (verificationEmail.delivered) {
          verificationEmailDelivery = { delivered: true }
        } else {
          const reason =
            'reason' in verificationEmail && typeof verificationEmail.reason === 'string'
              ? verificationEmail.reason
              : VERIFICATION_EMAIL_FAILED_REASON

          verificationEmailDelivery = {
            delivered: false,
            reason,
          }
        }
      } catch (error) {
        getRequestLogger(event).error('Invite verification email delivery failed.', {
          email: acceptedUser.email,
          error: serializeEmailError(error),
        })

        verificationEmailDelivery = {
          delivered: false,
          reason: VERIFICATION_EMAIL_FAILED_REASON,
        }
      }
    }

    return createApiSuccess(event, {
      email: acceptedUser.email,
      requiresEmailVerification,
      verificationEmailDelivery,
    })
  } catch (error) {
    if (!committed) {
      await client.query('rollback')
    }
    throw error
  } finally {
    client.release()
  }
})
