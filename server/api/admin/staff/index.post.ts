import { randomBytes } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { isEmailVerificationRequiredForRole, requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { requiresTemporaryPasswordChangeForRole } from '~/shared/auth'
import { normalizeRolePermissions, staffPermissions } from '~/shared/permissions'
import { syncStaffDepartmentAssignments } from '~/server/utils/staff'

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
  departmentIds: z.array(z.string().uuid()).default([]),
})

const generateTemporaryPassword = () => `Ajowa@${randomBytes(4).toString('hex').toUpperCase()}2026`

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'staff.manage')
  const body = validateInput(staffSchema, await readJsonBody(event))
  const temporaryPassword = body.temporaryPassword ?? generateTemporaryPassword()
  const rolePermissions = normalizeRolePermissions(body.role, body.permissions)
  const emailVerified = !isEmailVerificationRequiredForRole(body.role)
  const requiresPasswordChange = requiresTemporaryPasswordChangeForRole(body.role)
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
        values ($1, $2, $3)
        on conflict (email) do update
          set name = excluded.name,
              email_verified = excluded.email_verified,
              updated_at = now()
        returning id
      `,
      [body.fullName, body.email, emailVerified],
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
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        requiresPasswordChange,
        emailVerified,
        body.isActive,
        rolePermissions,
      ],
    )
    const userId = user.rows[0]?.id

    if (!userId) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Staff user creation failed.',
      })
    }

    const departmentIds = await syncStaffDepartmentAssignments(
      client,
      authMe.user.societyId,
      userId,
      body.role,
      body.departmentIds,
    )

    const passwordHash = await hashPassword(temporaryPassword)
    await client.query(
      `
        insert into auth_accounts (account_id, provider_id, user_id, password)
        values ($1, 'credential', $2, $3)
        on conflict (provider_id, account_id) do update
          set password = excluded.password,
              updated_at = now()
      `,
      [authUserId, authUserId, passwordHash],
    )

    await client.query('commit')
    return createApiSuccess(event, {
      id: userId,
      authUserId,
      email: body.email,
      temporaryPassword,
      requiresPasswordChange,
      departmentIds,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
