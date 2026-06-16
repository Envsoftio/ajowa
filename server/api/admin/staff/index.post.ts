import { randomBytes } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { buildAppUrl } from '~/server/utils/email'
import { staffPermissions } from '~/shared/permissions'

const staffSchema = z.object({
  role: z.enum(['MANAGER', 'SERVICE_STAFF', 'GUARD']),
  fullName: z.string().trim().min(2),
  email: z.string().trim().email(),
  mobileNumber: z.string().trim().min(8).max(20),
  whatsappNumber: z.string().trim().min(8).max(20).nullable().optional(),
  temporaryPassword: z.string().trim().min(8).max(128).optional(),
  canLogin: z.boolean().default(true),
  isActive: z.boolean().default(true),
  permissions: z.array(z.enum(staffPermissions)).default([]),
})

const generateTemporaryPassword = () => `Ajowa@${randomBytes(4).toString('hex').toUpperCase()}2026`

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'staff.manage')
  const body = validateInput(staffSchema, await readJsonBody(event))
  const temporaryPassword = body.temporaryPassword ?? generateTemporaryPassword()
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const existing = await client.query<{ id: string }>(
      `
        select id
        from users
        where society_id = $1 and email = $2
        limit 1
      `,
      [authMe.user.societyId, body.email],
    )

    if (existing.rows[0]?.id) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'A user with this email already exists in the society.',
      })
    }

    const authUser = await client.query<{ id: string }>(
      `
        insert into auth_users (name, email, email_verified)
        values ($1, $2, false)
        on conflict (email) do update
          set name = excluded.name,
              updated_at = now()
        returning id
      `,
      [body.fullName, body.email],
    )
    const authUserId = authUser.rows[0]?.id

    if (!authUserId) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Auth user creation failed.',
      })
    }

    const user = await client.query<{ id: string }>(
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
          is_active,
          staff_permissions
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, true, false, $9, $10)
        returning id
      `,
      [
        authMe.user.societyId,
        authUserId,
        body.role,
        body.fullName,
        body.email,
        body.mobileNumber,
        body.whatsappNumber ?? null,
        body.canLogin,
        body.isActive,
        body.permissions,
      ],
    )

    const credential = await client.query<{ id: string }>(
      `
        select id
        from auth_accounts
        where provider_id = 'credential' and user_id = $1
        limit 1
      `,
      [authUserId],
    )

    if (!credential.rows[0]?.id) {
      const passwordHash = await hashPassword(temporaryPassword)
      await client.query(
        `
          insert into auth_accounts (account_id, provider_id, user_id, password)
          values ($1, 'credential', $2, $3)
        `,
        [authUserId, authUserId, passwordHash],
      )
    }

    await client.query('commit')
    return createApiSuccess(event, {
      id: user.rows[0]?.id,
      authUserId,
      email: body.email,
      temporaryPassword,
      loginUrl: buildAppUrl('/login'),
      requiresPasswordChange: true,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
