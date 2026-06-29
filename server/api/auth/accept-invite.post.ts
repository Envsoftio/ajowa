import { z } from 'zod'
import { hashPassword } from 'better-auth/crypto'
import type { PoolClient } from 'pg'
import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import {
  assignInviteRelationships,
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
  password: z
    .string()
    .min(
      PASSWORD_POLICY.minLength,
      `Password must be at least ${PASSWORD_POLICY.minLength} characters.`,
    ),
})

type InviteAssignmentRow = {
  id: string
  society_id: string
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

type ExistingAppUserRow = {
  id: string
  auth_user_id: string | null
  email: string
  role: InviteAssignmentRow['role']
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

const toInviteAcceptanceError = (error: unknown) => {
  if (error instanceof AppError) {
    return error
  }

  const databaseError = error as {
    code?: string
    constraint?: string
    message?: string
  }

  if (databaseError.code === '23505') {
    if (databaseError.constraint === 'users_society_id_email_key') {
      return new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message:
          'A resident already exists with this email. Ask an admin to resend the invite from that resident profile.',
      })
    }

    if (databaseError.constraint === 'auth_users_email_key') {
      return new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message:
          'An account already exists with this email. Ask an admin to review the resident login and resend the invite.',
      })
    }

    if (
      databaseError.constraint ===
      'flat_residents_one_active_tenant_household_idx'
    ) {
      return new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message:
          'This flat already has an active tenant household. Ask an admin to update the existing tenant record or resend the correct invite.',
      })
    }

    if (
      databaseError.constraint === 'flat_residents_one_primary_contact_idx' ||
      databaseError.constraint === 'flat_residents_one_billing_contact_idx'
    ) {
      return new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message:
          'This flat already has an active primary or billing contact. Ask an admin to update the flat relationship and resend the invite.',
      })
    }
  }

  if (
    databaseError.code === 'P0001' &&
    databaseError.message?.includes(
      'tenant relationships require lease_start_date and lease_end_date',
    )
  ) {
    return new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'Tenant invites need lease start and end dates. Ask an admin to add the lease details on the resident profile, then resend the invite.',
    })
  }

  if (databaseError.code === '23503') {
    return new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'This invite points to a flat, department, or account that no longer exists. Ask an admin to resend a fresh invite.',
    })
  }

  if (
    databaseError.code === '23514' &&
    databaseError.constraint === 'users_login_requires_auth_email'
  ) {
    return new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'This resident needs a valid email and login account before the invite can be accepted.',
    })
  }

  return new AppError({
    code: 'INTERNAL_ERROR',
    statusCode: 500,
    message:
      'We could not activate this invite. Ask an admin to review the resident record and resend the invite.',
  })
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
  const existingResult = await client.query<{
    id: string
    user_id: string | null
    email: string
  }>(
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
      values ($1::text, 'credential', $1::uuid, $2)
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

const createInviteCredentialUser = async ({
  client,
  societyId,
  email,
  role,
  fullName,
  mobileNumber,
  whatsappNumber,
  password,
  emailVerified,
}: {
  client: PoolClient
  societyId: string
  email: string
  role: InviteAssignmentRow['role']
  fullName: string
  mobileNumber: string
  whatsappNumber: string
  password: string
  emailVerified: boolean
}): Promise<AcceptedInviteUser> => {
  const existingAuthUser = await client.query<{ id: string }>(
    `
      select id
      from auth_users
      where email = $1
      limit 1
    `,
    [email],
  )

  if (existingAuthUser.rows[0]?.id) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message:
        'An account already exists with this email. Ask an admin to review the resident login and resend the invite.',
    })
  }

  const insertedAuthUser = await client.query<{ id: string; email: string }>(
    `
      insert into auth_users (name, email, email_verified)
      values ($1, $2, $3)
      returning id, email::text
    `,
    [fullName, email, emailVerified],
  )
  const authUser = insertedAuthUser.rows[0]

  if (!authUser?.id) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'Account creation did not return an auth identifier.',
    })
  }

  const passwordHash = await hashPassword(password)

  await client.query(
    `
      insert into auth_accounts (account_id, provider_id, user_id, password)
      values ($1::text, 'credential', $1::uuid, $2)
    `,
    [authUser.id, passwordHash],
  )

  await client.query(
    `
      insert into users (
        society_id,
        auth_user_id,
        role,
        full_name,
        email,
        mobile_number,
        whatsapp_number,
        can_login,
        must_change_password,
        email_verified,
        is_active
      )
      values ($1, $2, $3, $4, $5, $6, $7, true, false, $8, true)
    `,
    [
      societyId,
      authUser.id,
      role,
      fullName,
      email,
      mobileNumber,
      whatsappNumber,
      emailVerified,
    ],
  )

  return {
    authUserId: authUser.id,
    email: authUser.email,
    fullName,
  }
}

const acceptExistingAppUserByEmail = async ({
  client,
  societyId,
  email,
  role,
  fullName,
  mobileNumber,
  whatsappNumber,
  password,
  emailVerified,
}: {
  client: PoolClient
  societyId: string
  email: string
  role: InviteAssignmentRow['role']
  fullName: string
  mobileNumber: string
  whatsappNumber: string
  password: string
  emailVerified: boolean
}): Promise<AcceptedInviteUser | null> => {
  const existingResult = await client.query<ExistingAppUserRow>(
    `
      select id, auth_user_id::text, email::text, role
      from users
      where society_id = $1 and email = $2
      limit 1
    `,
    [societyId, email],
  )
  const existing = existingResult.rows[0]

  if (!existing) {
    return null
  }

  if (existing.role !== role) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message:
        'This email already belongs to a different type of account. Ask an admin to review the resident record and resend the correct invite.',
    })
  }

  if (existing.auth_user_id) {
    return acceptExistingCredentialUser({
      client,
      authUserId: existing.auth_user_id,
      email,
      fullName,
      mobileNumber,
      whatsappNumber,
      password,
      emailVerified,
    })
  }

  const authUserResult = await client.query<{ id: string }>(
    `
      select id
      from auth_users
      where email = $1
      limit 1
    `,
    [email],
  )

  let authUserId = authUserResult.rows[0]?.id ?? null

  if (authUserId) {
    const linkedUserResult = await client.query<{ id: string }>(
      `
        select id
        from users
        where auth_user_id = $1 and id <> $2
        limit 1
      `,
      [authUserId, existing.id],
    )

    if (linkedUserResult.rows[0]?.id) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message:
          'This email is already linked to another account. Ask an admin to review the resident record and resend the invite.',
      })
    }
  } else {
    const insertedAuthUser = await client.query<{ id: string }>(
      `
        insert into auth_users (name, email, email_verified)
        values ($1, $2, $3)
        returning id
      `,
      [fullName, email, emailVerified],
    )
    authUserId = insertedAuthUser.rows[0]?.id ?? null
  }

  if (!authUserId) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'Account creation did not return an auth identifier.',
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
      values ($1::text, 'credential', $1::uuid, $2)
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
      set auth_user_id = $2,
          full_name = $3,
          mobile_number = $4,
          whatsapp_number = $5,
          can_login = true,
          must_change_password = false,
          email_verified = $6,
          is_active = true,
          updated_at = now()
      where id = $1
    `,
    [
      existing.id,
      authUserId,
      fullName,
      mobileNumber,
      whatsappNumber,
      emailVerified,
    ],
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

  const pool = getDatabasePool()
  let client: PoolClient | null = null
  let committed = false

  try {
    client = await pool.connect()
    await client.query('begin')

    const inviteResult = await client.query<InviteAssignmentRow>(
      `
        select
          id,
          society_id::text,
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
        for update
      `,
      [hashInviteToken(body.token)],
    )

    const invite = inviteResult.rows[0]

    if (!invite) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'This invite is invalid or no longer available.',
      })
    }

    if (
      invite.accepted_at ||
      invite.revoked_at ||
      new Date(invite.expires_at).getTime() <= Date.now()
    ) {
      throw new AppError({
        code: 'FORBIDDEN',
        statusCode: 403,
        message: 'This invite is no longer active.',
      })
    }

    const requiresEmailVerification = isEmailVerificationRequiredForRole(
      invite.role,
    )
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
      : ((await acceptExistingAppUserByEmail({
          client,
          societyId: invite.society_id,
          email: invite.email,
          role: invite.role,
          fullName: body.fullName,
          mobileNumber: body.mobileNumber,
          whatsappNumber: body.whatsappNumber || body.mobileNumber,
          password: body.password,
          emailVerified: !requiresEmailVerification,
        })) ??
        (await createInviteCredentialUser({
          client,
          societyId: invite.society_id,
          email: invite.email,
          role: invite.role,
          fullName: body.fullName,
          password: body.password,
          mobileNumber: body.mobileNumber,
          whatsappNumber: body.whatsappNumber || body.mobileNumber,
          emailVerified: !requiresEmailVerification,
        })))

    await assignInviteRelationships({
      client,
      authUserId: acceptedUser.authUserId,
      role: invite.role,
      flatIds: invite.flat_ids ?? [],
      relationshipType: invite.relationship_type,
      accessScope: invite.access_scope,
      departmentIds: invite.department_ids ?? [],
    })

    const acceptedInviteResult = await client.query<{ id: string }>(
      `
        update auth_invites
        set accepted_at = now(),
            accepted_by_auth_user_id = $2,
            updated_at = now()
        where id = $1
          and accepted_at is null
          and revoked_at is null
        returning id
      `,
      [invite.id, acceptedUser.authUserId],
    )

    if (!acceptedInviteResult.rows[0]?.id) {
      throw new AppError({
        code: 'FORBIDDEN',
        statusCode: 403,
        message: 'This invite is no longer active.',
      })
    }

    await client.query('commit')
    committed = true

    let verificationEmailDelivery: VerificationEmailDelivery | null = null
    if (requiresEmailVerification) {
      try {
        const verificationEmail = await sendVerificationEmailToUser({
          id: acceptedUser.authUserId,
          email: acceptedUser.email,
          name: acceptedUser.fullName,
          societyId: invite.society_id,
          client,
        })

        if (verificationEmail.delivered) {
          verificationEmailDelivery = { delivered: true }
        } else {
          const reason =
            'reason' in verificationEmail &&
            typeof verificationEmail.reason === 'string'
              ? verificationEmail.reason
              : VERIFICATION_EMAIL_FAILED_REASON

          verificationEmailDelivery = {
            delivered: false,
            reason,
          }
        }
      } catch (error) {
        getRequestLogger(event).error(
          'Invite verification email delivery failed.',
          {
            email: acceptedUser.email,
            error: serializeEmailError(error),
          },
        )

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
    if (client && !committed) {
      try {
        await client.query('rollback')
      } catch (rollbackError) {
        getRequestLogger(event).error('Invite acceptance rollback failed.', {
          error: serializeEmailError(rollbackError),
        })
      }
    }
    const inviteError = toInviteAcceptanceError(error)

    if (inviteError.code === 'INTERNAL_ERROR') {
      getRequestLogger(event).error('Invite acceptance failed.', {
        error: serializeEmailError(error),
      })
    }

    throw inviteError
  } finally {
    client?.release()
  }
})
