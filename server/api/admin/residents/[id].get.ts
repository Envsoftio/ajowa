import type { FlatResidentRelationship, ResidentDetail } from '~/types/domain'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'

type ResidentRow = {
  id: string
  society_id: string
  auth_user_id: string
  role: string
  full_name: string
  email: string
  mobile_number: string
  whatsapp_number: string | null
  is_whatsapp_same_as_mobile: boolean
  profile_image_path: string | null
  can_login: boolean
  email_verified: boolean
  is_active: boolean
  kyc_status: string
  police_verification_status: string
  emergency_contact_name: string | null
  emergency_contact_number: string | null
  government_id_type: string | null
  government_id_number: string | null
  government_id_document_path: string | null
  ownership_proof_path: string | null
  lease_agreement_path: string | null
  preferred_notification_channels: string
  created_at: string
  updated_at: string
}

type RelationshipRow = {
  id: string
  flat_id: string
  user_id: string
  resident_name: string
  resident_email: string
  resident_mobile_number: string
  relationship_type: string
  is_primary_contact: boolean
  is_billing_contact: boolean
  can_login: boolean
  is_active: boolean
  ownership_percent: string | null
  ownership_label: string | null
  ownership_start_date: string | null
  lease_start_date: string | null
  lease_end_date: string | null
  contract_start_date: string | null
  contract_end_date: string | null
  occupancy_status: string | null
  access_scope: string | null
  relationship_note: string | null
  security_deposit_amount: string | null
  security_deposit_note: string | null
  created_at: string
  updated_at: string
}

const mapRelationship = (row: RelationshipRow): FlatResidentRelationship => ({
  id: row.id,
  flatId: row.flat_id,
  userId: row.user_id,
  residentName: row.resident_name,
  residentEmail: row.resident_email,
  residentMobileNumber: row.resident_mobile_number,
  relationshipType: row.relationship_type,
  isPrimaryContact: row.is_primary_contact,
  isBillingContact: row.is_billing_contact,
  canLogin: row.can_login,
  isActive: row.is_active,
  ownershipPercent: row.ownership_percent ? Number(row.ownership_percent) : null,
  ownershipLabel: row.ownership_label,
  ownershipStartDate: row.ownership_start_date,
  leaseStartDate: row.lease_start_date,
  leaseEndDate: row.lease_end_date,
  contractStartDate: row.contract_start_date,
  contractEndDate: row.contract_end_date,
  occupancyStatus: row.occupancy_status,
  accessScope: row.access_scope,
  relationshipNote: row.relationship_note,
  securityDepositAmount: row.security_deposit_amount ? Number(row.security_deposit_amount) : null,
  securityDepositNote: row.security_deposit_note,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const pool = getDatabasePool()

  const [residentResult, relationshipsResult] = await Promise.all([
    pool.query<ResidentRow>(
      `
        select
          id,
          society_id,
          auth_user_id,
          role::text,
          full_name,
          email::text,
          mobile_number,
          whatsapp_number,
          is_whatsapp_same_as_mobile,
          profile_image_path,
          can_login,
          email_verified,
          is_active,
          kyc_status::text,
          police_verification_status::text,
          emergency_contact_name,
          emergency_contact_number,
          government_id_type,
          government_id_number,
          government_id_document_path,
          ownership_proof_path,
          lease_agreement_path,
          preferred_notification_channels::text,
          created_at::text,
          updated_at::text
        from users
        where id = $1 and society_id = $2
        limit 1
      `,
      [id, authMe.user.societyId],
    ),
    pool.query<RelationshipRow>(
      `
        select
          fr.id,
          fr.flat_id,
          fr.user_id,
          u.full_name as resident_name,
          u.email as resident_email,
          u.mobile_number as resident_mobile_number,
          fr.relationship_type::text,
          fr.is_primary_contact,
          fr.is_billing_contact,
          fr.can_login,
          fr.is_active,
          fr.ownership_percent::text,
          fr.ownership_label,
          fr.ownership_start_date::text,
          fr.lease_start_date::text,
          fr.lease_end_date::text,
          fr.contract_start_date::text,
          fr.contract_end_date::text,
          fr.occupancy_status::text,
          fr.access_scope::text,
          fr.relationship_note,
          fr.security_deposit_amount::text,
          fr.security_deposit_note,
          fr.created_at::text,
          fr.updated_at::text
        from flat_residents fr
        inner join users u on u.id = fr.user_id
        where fr.user_id = $1
        order by fr.is_active desc, fr.created_at desc
      `,
      [id],
    ),
  ])

  const row = residentResult.rows[0]

  if (!row) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Resident not found.',
    })
  }
  const detail: ResidentDetail = {
    id: row.id,
    societyId: row.society_id,
    authUserId: row.auth_user_id,
    role: row.role,
    fullName: row.full_name,
    email: row.email,
    mobileNumber: row.mobile_number,
    whatsappNumber: row.whatsapp_number,
    isWhatsappSameAsMobile: row.is_whatsapp_same_as_mobile,
    profileImagePath: row.profile_image_path,
    canLogin: row.can_login,
    emailVerified: row.email_verified,
    isActive: row.is_active,
    kycStatus: row.kyc_status,
    policeVerificationStatus: row.police_verification_status,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactNumber: row.emergency_contact_number,
    governmentIdType: row.government_id_type,
    governmentIdNumber: row.government_id_number,
    governmentIdDocumentPath: row.government_id_document_path,
    ownershipProofPath: row.ownership_proof_path,
    leaseAgreementPath: row.lease_agreement_path,
    preferredNotificationChannels: row.preferred_notification_channels,
    relationships: relationshipsResult.rows.map(mapRelationship),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  return createApiSuccess(event, detail)
})
