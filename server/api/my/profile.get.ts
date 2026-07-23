import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'

type ResidentProfileRow = {
  id: string
  full_name: string
  email: string | null
  mobile_number: string | null
  whatsapp_number: string | null
  profile_image_path: string | null
  updated_at: string
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])

  const result = await getDatabasePool().query<ResidentProfileRow>(
    `
      select
        id,
        full_name,
        email::text,
        mobile_number,
        whatsapp_number,
        profile_image_path,
        updated_at::text
      from users
      where id = $1
        and society_id = $2
        and role = 'RESIDENT'
        and deleted_at is null
      limit 1
    `,
    [authMe.user.id, authMe.user.societyId],
  )
  const profile = result.rows[0]

  if (!profile) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Resident profile not found.',
    })
  }

  return createApiSuccess(event, {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    mobileNumber: profile.mobile_number,
    whatsappNumber: profile.whatsapp_number,
    profileImagePath: profile.profile_image_path,
    profileImageUrl: profile.profile_image_path
      ? `/api/my/profile/photo?v=${encodeURIComponent(profile.updated_at)}`
      : null,
    updatedAt: profile.updated_at,
  })
})
