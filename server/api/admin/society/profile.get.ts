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
  payment_qr_file_id: string | null
  payment_qr_original_file_name: string | null
  payment_qr_mime_type: string | null
  payment_qr_size_bytes: string | null
  payment_qr_uploaded_at: string | null
  created_at: string
  updated_at: string
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const pool = getDatabasePool()
  const result = await pool.query<SocietyProfileRow>(
    `
      select
        sp.id,
        sp.code,
        sp.name,
        sp.registration_number,
        sp.address_line_1,
        sp.address_line_2,
        sp.city,
        sp.state,
        sp.pincode,
        sp.contact_email,
        sp.contact_phone,
        sp.timezone,
        sp.is_active,
        sp.settings,
        payment_qr.id as payment_qr_file_id,
        payment_qr.original_file_name as payment_qr_original_file_name,
        payment_qr.mime_type as payment_qr_mime_type,
        payment_qr.size_bytes::text as payment_qr_size_bytes,
        payment_qr.uploaded_at::text as payment_qr_uploaded_at,
        sp.created_at::text,
        sp.updated_at::text
      from society_profile sp
      left join file_objects payment_qr
        on payment_qr.id = sp.payment_qr_file_id
        and payment_qr.storage_target_key = 'qr_images'
        and payment_qr.upload_status = 'READY'
      where sp.id = $1
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
    paymentQrFile: row.payment_qr_file_id
      ? {
          id: row.payment_qr_file_id,
          fileName: row.payment_qr_original_file_name ?? 'payment-qr',
          mimeType: row.payment_qr_mime_type ?? 'application/octet-stream',
          sizeBytes: Number(row.payment_qr_size_bytes ?? 0),
          uploadedAt: row.payment_qr_uploaded_at ?? row.updated_at,
          downloadUrl: '/api/admin/society/payment-qr',
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  return createApiSuccess(event, profile)
})
