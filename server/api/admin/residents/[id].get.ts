import type {
  FlatResidentRelationship,
  ResidentAccessLogSummary,
  ResidentDetail,
  ResidentDueSummary,
  ResidentPaymentSummary,
  ResidentServiceRequestSummary,
} from '~/types/domain'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { getResidentProfessionProfile } from '~/server/utils/professions'

type ResidentRow = {
  id: string
  society_id: string
  auth_user_id: string | null
  role: string
  full_name: string
  email: string | null
  source_email: string | null
  mobile_number: string | null
  source_contact: string | null
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
  admin_notes: string | null
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
  block_name: string | null
  flat_number: string | null
  user_id: string
  resident_name: string
  resident_email: string | null
  resident_mobile_number: string | null
  relationship_type: string
  is_primary_contact: boolean
  is_billing_contact: boolean
  can_login: boolean
  is_active: boolean
  ownership_start_date: string | null
  lease_start_date: string | null
  lease_end_date: string | null
  contract_start_date: string | null
  contract_end_date: string | null
  occupancy_status: string | null
  access_scope: string | null
  relationship_note: string | null
  created_at: string
  updated_at: string
}

type PaymentRow = {
  id: string
  payer_user_id: string
  payer_name: string | null
  flat_id: string | null
  flat_number: string | null
  block_name: string | null
  payment_date: string
  amount: string
  mode: string
  status: string
  utr_reference: string | null
  bank_reference: string | null
  receipt_number: string | null
  created_at: string
  updated_at: string
}

type DueRow = {
  id: string
  billing_period_label: string
  flat_id: string
  flat_number: string
  block_name: string
  due_date: string
  total_amount: string
  paid_amount: string
  balance_amount: string
  status: string
  created_at: string
  updated_at: string
}

type ServiceRequestRow = {
  id: string
  request_number: string
  requester_user_id: string | null
  requester_name: string | null
  flat_id: string | null
  flat_label: string | null
  category: string
  title: string
  priority: string
  status: string
  due_by_at: string | null
  is_sla_breached: boolean
  created_at: string
  updated_at: string
}

type AccessLogRow = {
  id: string
  user_id: string | null
  user_name: string | null
  flat_id: string | null
  flat_number: string | null
  block_name: string | null
  scan_result: string
  denial_reason: string | null
  gate_name: string | null
  scanned_at: string
}

const sourceEmailSql = `
  max(
    case
      when source_fr.import_metadata->>'relationshipSource' = 'OWNER'
        and upper(coalesce(btrim(source_fr.import_metadata #>> '{sourceData,EMAIL ID}'), '')) not in ('', 'NA', 'N/A', '--', 'NIL')
        then btrim(source_fr.import_metadata #>> '{sourceData,EMAIL ID}')
      else null
    end
  )::text
`

const sourceContactSql = `
  max(
    case
      when source_fr.import_metadata->>'relationshipSource' = 'OWNER'
        and upper(coalesce(btrim(source_fr.import_metadata #>> '{sourceData,CONTACT DETAILS}'), '')) not in ('', 'NA', 'N/A', '--', 'NIL')
        then btrim(source_fr.import_metadata #>> '{sourceData,CONTACT DETAILS}')
      else null
    end
  )::text
`

const mapRelationship = (row: RelationshipRow): FlatResidentRelationship => ({
  id: row.id,
  flatId: row.flat_id,
  blockName: row.block_name,
  flatNumber: row.flat_number,
  userId: row.user_id,
  residentName: row.resident_name,
  residentEmail: row.resident_email,
  residentMobileNumber: row.resident_mobile_number,
  relationshipType: row.relationship_type,
  isPrimaryContact: row.is_primary_contact,
  isBillingContact: row.is_billing_contact,
  canLogin: row.can_login,
  isActive: row.is_active,
  ownershipStartDate: row.ownership_start_date,
  leaseStartDate: row.lease_start_date,
  leaseEndDate: row.lease_end_date,
  contractStartDate: row.contract_start_date,
  contractEndDate: row.contract_end_date,
  occupancyStatus: row.occupancy_status,
  accessScope: row.access_scope,
  relationshipNote: row.relationship_note,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapPayment = (row: PaymentRow): ResidentPaymentSummary => ({
  id: row.id,
  payerUserId: row.payer_user_id,
  payerName: row.payer_name,
  flatId: row.flat_id,
  flatNumber: row.flat_number,
  blockName: row.block_name,
  paymentDate: row.payment_date,
  amount: Number(row.amount),
  mode: row.mode,
  status: row.status,
  utrReference: row.utr_reference,
  bankReference: row.bank_reference,
  receiptNumber: row.receipt_number,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapDue = (row: DueRow): ResidentDueSummary => ({
  id: row.id,
  billingPeriodLabel: row.billing_period_label,
  flatId: row.flat_id,
  flatNumber: row.flat_number,
  blockName: row.block_name,
  dueDate: row.due_date,
  totalAmount: Number(row.total_amount),
  paidAmount: Number(row.paid_amount),
  balanceAmount: Number(row.balance_amount),
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapServiceRequest = (
  row: ServiceRequestRow,
): ResidentServiceRequestSummary => ({
  id: row.id,
  requestNumber: row.request_number,
  requesterUserId: row.requester_user_id,
  requesterName: row.requester_name,
  flatId: row.flat_id,
  flatLabel: row.flat_label,
  category: row.category,
  title: row.title,
  priority: row.priority,
  status: row.status,
  dueByAt: row.due_by_at,
  isSlaBreached: row.is_sla_breached,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapAccessLog = (row: AccessLogRow): ResidentAccessLogSummary => ({
  id: row.id,
  userId: row.user_id,
  userName: row.user_name,
  flatId: row.flat_id,
  flatNumber: row.flat_number,
  blockName: row.block_name,
  scanResult: row.scan_result,
  denialReason: row.denial_reason,
  gateName: row.gate_name,
  scannedAt: row.scanned_at,
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const pool = getDatabasePool()

  const [
    residentResult,
    relationshipsResult,
    flatOccupantsResult,
    duesResult,
    paymentsResult,
    serviceRequestsResult,
    accessLogsResult,
    professionProfile,
  ] = await Promise.all([
    pool.query<ResidentRow>(
      `
        select
          u.id,
          u.society_id,
          u.auth_user_id,
          u.role::text,
          u.full_name,
          u.email::text,
          source.source_email,
          u.mobile_number,
          source.source_contact,
          u.whatsapp_number,
          u.is_whatsapp_same_as_mobile,
          u.profile_image_path,
          u.can_login,
          u.email_verified,
          u.is_active,
          u.kyc_status::text,
          u.police_verification_status::text,
          u.emergency_contact_name,
          u.emergency_contact_number,
          u.admin_notes,
          u.government_id_type,
          u.government_id_number,
          u.government_id_document_path,
          u.ownership_proof_path,
          u.lease_agreement_path,
          u.preferred_notification_channels::text,
          u.created_at::text,
          u.updated_at::text
        from users u
        left join lateral (
          select
            ${sourceEmailSql} as source_email,
            ${sourceContactSql} as source_contact
          from flat_residents source_fr
          where source_fr.user_id = u.id
        ) source on true
        where u.id = $1 and u.society_id = $2
        limit 1
      `,
      [id, authMe.user.societyId],
    ),
    pool.query<RelationshipRow>(
      `
        select
          fr.id,
          fr.flat_id,
          b.name as block_name,
          f.flat_number,
          fr.user_id,
          u.full_name as resident_name,
          u.email as resident_email,
          u.mobile_number as resident_mobile_number,
          fr.relationship_type::text,
          fr.is_primary_contact,
          fr.is_billing_contact,
          fr.can_login,
          fr.is_active,
          fr.ownership_start_date::text,
          fr.lease_start_date::text,
          fr.lease_end_date::text,
          fr.contract_start_date::text,
          fr.contract_end_date::text,
          fr.occupancy_status::text,
          fr.access_scope::text,
          fr.relationship_note,
          fr.created_at::text,
          fr.updated_at::text
        from flat_residents fr
        inner join users u on u.id = fr.user_id
        inner join flats f on f.id = fr.flat_id
        inner join blocks b on b.id = f.block_id
        where fr.user_id = $1
        order by fr.is_active desc, fr.created_at desc
      `,
      [id],
    ),
    pool.query<RelationshipRow>(
      `
        select
          fr.id,
          fr.flat_id,
          b.name as block_name,
          f.flat_number,
          fr.user_id,
          u.full_name as resident_name,
          u.email as resident_email,
          u.mobile_number as resident_mobile_number,
          fr.relationship_type::text,
          fr.is_primary_contact,
          fr.is_billing_contact,
          fr.can_login,
          fr.is_active,
          fr.ownership_start_date::text,
          fr.lease_start_date::text,
          fr.lease_end_date::text,
          fr.contract_start_date::text,
          fr.contract_end_date::text,
          fr.occupancy_status::text,
          fr.access_scope::text,
          fr.relationship_note,
          fr.created_at::text,
          fr.updated_at::text
        from flat_residents fr
        inner join users u on u.id = fr.user_id
        inner join flats f on f.id = fr.flat_id
        inner join blocks b on b.id = f.block_id
        where f.society_id = $2
          and exists (
            select 1
            from flat_residents current_fr
            where current_fr.user_id = $1
              and current_fr.flat_id = fr.flat_id
          )
        order by f.flat_number asc,
          case fr.relationship_type when 'OWNER' then 0 when 'TENANT' then 1 else 2 end,
          fr.is_active desc,
          u.full_name asc
      `,
      [id, authMe.user.societyId],
    ),
    pool.query<DueRow>(
      `
        select
          md.id,
          bp.label as billing_period_label,
          md.flat_id,
          f.flat_number,
          b.name as block_name,
          md.due_date::text,
          md.total_amount::text,
          md.paid_amount::text,
          md.balance_amount::text,
          md.status::text,
          md.created_at::text,
          md.updated_at::text
        from maintenance_dues md
        inner join billing_periods bp on bp.id = md.billing_period_id
        inner join flats f on f.id = md.flat_id
        inner join blocks b on b.id = f.block_id
        where md.society_id = $2
          and exists (
            select 1
            from flat_residents current_fr
            where current_fr.user_id = $1
              and current_fr.flat_id = md.flat_id
          )
        order by md.due_date desc, bp.start_date desc
        limit 12
      `,
      [id, authMe.user.societyId],
    ),
    pool.query<PaymentRow>(
      `
        select
          p.id,
          p.payer_user_id,
          payer.full_name as payer_name,
          p.received_for_flat_id as flat_id,
          f.flat_number,
          b.name as block_name,
          p.payment_date::text,
          p.amount::text,
          p.mode::text,
          p.status::text,
          p.utr_reference,
          p.bank_reference,
          p.receipt_number,
          p.created_at::text,
          p.updated_at::text
        from payments p
        left join users payer on payer.id = p.payer_user_id
        left join flats f on f.id = p.received_for_flat_id
        left join blocks b on b.id = f.block_id
        where p.society_id = $2
          and (
            p.payer_user_id = $1
            or exists (
              select 1
              from flat_residents current_fr
              where current_fr.user_id = $1
                and current_fr.flat_id = p.received_for_flat_id
            )
          )
        order by p.payment_date desc, p.created_at desc
        limit 12
      `,
      [id, authMe.user.societyId],
    ),
    pool.query<ServiceRequestRow>(
      `
        select
          sr.id,
          sr.request_number,
          sr.requester_user_id,
          requester.full_name as requester_name,
          sr.flat_id,
          concat_ws(' · ', b.name, f.flat_number) as flat_label,
          sr.category,
          sr.title,
          sr.priority::text,
          sr.status::text,
          sr.due_by_at::text,
          sr.is_sla_breached,
          sr.created_at::text,
          sr.updated_at::text
        from service_requests sr
        left join users requester on requester.id = sr.requester_user_id
        left join flats f on f.id = sr.flat_id
        left join blocks b on b.id = f.block_id
        where sr.society_id = $2
          and (
            sr.requester_user_id = $1
            or exists (
              select 1
              from flat_residents current_fr
              where current_fr.user_id = $1
                and current_fr.flat_id = sr.flat_id
            )
          )
        order by
          case when sr.status not in ('RESOLVED', 'CLOSED', 'CANCELLED') then 0 else 1 end,
          sr.created_at desc
        limit 12
      `,
      [id, authMe.user.societyId],
    ),
    pool.query<AccessLogRow>(
      `
        select
          gsl.id,
          gsl.user_id,
          u.full_name as user_name,
          gsl.flat_id,
          f.flat_number,
          b.name as block_name,
          gsl.scan_result::text,
          gsl.denial_reason,
          gsl.gate_name,
          gsl.scanned_at::text
        from gate_scan_logs gsl
        left join users u on u.id = gsl.user_id
        left join flats f on f.id = gsl.flat_id
        left join blocks b on b.id = f.block_id
        where gsl.society_id = $2
          and (
            gsl.user_id = $1
            or exists (
              select 1
              from flat_residents current_fr
              where current_fr.user_id = $1
                and current_fr.flat_id = gsl.flat_id
            )
          )
        order by gsl.scanned_at desc
        limit 12
      `,
      [id, authMe.user.societyId],
    ),
    getResidentProfessionProfile(pool, authMe.user.societyId, id),
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
    sourceEmail: row.source_email,
    mobileNumber: row.mobile_number,
    sourceContact: row.source_contact,
    whatsappNumber: row.whatsapp_number,
    isWhatsappSameAsMobile: row.is_whatsapp_same_as_mobile,
    profileImagePath: row.profile_image_path,
    canLogin: row.can_login,
    emailVerified: row.email_verified,
    isActive: row.is_active,
    kycStatus: row.kyc_status,
    policeVerificationStatus: row.police_verification_status,
    professionProfile,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactNumber: row.emergency_contact_number,
    adminNotes: row.admin_notes,
    governmentIdType: row.government_id_type,
    governmentIdNumber: row.government_id_number,
    governmentIdDocumentPath: row.government_id_document_path,
    ownershipProofPath: row.ownership_proof_path,
    leaseAgreementPath: row.lease_agreement_path,
    preferredNotificationChannels: row.preferred_notification_channels,
    relationships: relationshipsResult.rows.map(mapRelationship),
    flatOccupants: flatOccupantsResult.rows.map(mapRelationship),
    dues: duesResult.rows.map(mapDue),
    payments: paymentsResult.rows.map(mapPayment),
    serviceRequests: serviceRequestsResult.rows.map(mapServiceRequest),
    accessLogs: accessLogsResult.rows.map(mapAccessLog),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  return createApiSuccess(event, detail)
})
