import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { isEmailVerificationRequiredForRole, requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { normalizeRolePermissions, staffPermissions } from '~/shared/permissions'
import { syncStaffDepartmentAssignments } from '~/server/utils/staff'

const staffSchema = z.object({
  role: z.enum(['MANAGER', 'SERVICE_STAFF', 'GUARD']),
  fullName: z.string().trim().min(2),
  mobileNumber: z.string().trim().min(8).max(20),
  whatsappNumber: z.string().trim().min(8).max(20).nullable().optional(),
  canLogin: z.boolean().default(true),
  isActive: z.boolean().default(true),
  permissions: z.array(z.enum(staffPermissions)).default([]),
  departmentIds: z.array(z.string().uuid()).default([]),
})

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'staff.manage')
  const id = readUuidParam(event)
  const body = validateInput(staffSchema, await readJsonBody(event))
  const rolePermissions = normalizeRolePermissions(body.role, body.permissions)
  const emailVerified = !isEmailVerificationRequiredForRole(body.role)
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const result = await client.query<{ id: string; auth_user_id: string }>(
      `
        update users
        set role = $3::app_role,
            full_name = $4,
            mobile_number = $5,
            whatsapp_number = $6,
            can_login = $7,
            is_active = $8,
            staff_permissions = $9,
            email_verified = $10,
            must_change_password = case
              when $3::app_role = 'GUARD'::app_role then false
              else must_change_password
            end,
            updated_at = now()
        where id = $1
          and society_id = $2
          and role in ('MANAGER', 'SERVICE_STAFF', 'GUARD')
          and deleted_at is null
        returning id, auth_user_id
      `,
      [
        id,
        authMe.user.societyId,
        body.role,
        body.fullName,
        body.mobileNumber,
        body.whatsappNumber ?? null,
        body.canLogin,
        body.isActive,
        rolePermissions,
        emailVerified,
      ],
    )

    const updated = result.rows[0]

    if (!updated?.id) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Staff member was not found.',
      })
    }

    const departmentIds = await syncStaffDepartmentAssignments(
      client,
      authMe.user.societyId,
      updated.id,
      body.role,
      body.departmentIds,
    )

    await client.query(
      `
        update auth_users
        set email_verified = $2,
            updated_at = now()
        where id = $1
      `,
      [updated.auth_user_id, emailVerified],
    )

    await client.query('commit')
    return createApiSuccess(event, { id, departmentIds })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
