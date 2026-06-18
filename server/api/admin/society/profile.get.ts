import type { SocietyProfile } from '~/types/domain'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { normalizeSocietySettings } from '~/server/utils/master-data'

type SocietyProfileRow = {
  id: string
  code: string
  name: string
  registration_number: string | null
  address_line_1: string
  address_line_2: string | null
  city: string
  state: string
  pincode: string
  contact_email: string | null
  contact_phone: string | null
  timezone: string
  is_active: boolean
  settings: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const pool = getDatabasePool()
  const result = await pool.query<SocietyProfileRow>(
    `
      select
        id,
        code,
        name,
        registration_number,
        address_line_1,
        address_line_2,
        city,
        state,
        pincode,
        contact_email,
        contact_phone,
        timezone,
        is_active,
        settings,
        created_at::text,
        updated_at::text
      from society_profile
      where id = $1
      limit 1
    `,
    [authMe.user.societyId],
  )

  const row = result.rows[0]

  if (!row) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Society profile not found.',
    })
  }

  const profile: SocietyProfile = {
    id: row.id,
    code: row.code,
    name: row.name,
    registrationNumber: row.registration_number,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    timezone: row.timezone,
    isActive: row.is_active,
    settings: normalizeSocietySettings(row.settings),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  return createApiSuccess(event, profile)
})
