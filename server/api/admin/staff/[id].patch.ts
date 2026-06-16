import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { staffPermissions } from '~/shared/permissions'

const staffSchema = z.object({
  role: z.enum(['MANAGER', 'SERVICE_STAFF', 'GUARD']),
  fullName: z.string().trim().min(2),
  mobileNumber: z.string().trim().min(8).max(20),
  whatsappNumber: z.string().trim().min(8).max(20).nullable().optional(),
  canLogin: z.boolean().default(true),
  isActive: z.boolean().default(true),
  permissions: z.array(z.enum(staffPermissions)).default([]),
})

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'staff.manage')
  const id = readUuidParam(event)
  const body = validateInput(staffSchema, await readJsonBody(event))
  const pool = getDatabasePool()

  const result = await pool.query<{ id: string }>(
    `
      update users
      set role = $3,
          full_name = $4,
          mobile_number = $5,
          whatsapp_number = $6,
          can_login = $7,
          is_active = $8,
          staff_permissions = $9,
          updated_at = now()
      where id = $1
        and society_id = $2
        and role in ('MANAGER', 'SERVICE_STAFF', 'GUARD')
      returning id
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
      body.permissions,
    ],
  )

  if (!result.rows[0]?.id) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Staff member was not found.',
    })
  }

  return createApiSuccess(event, { id })
})
