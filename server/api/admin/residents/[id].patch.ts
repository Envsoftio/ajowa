import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import {
  ensureResidentRelationshipsAreValid,
  readUuidParam,
  residentSchema,
  writeMasterAudit,
} from '~/server/utils/master-data'

type ResidentRow = {
  auth_user_id: string
  full_name: string
  email: string
  mobile_number: string
  whatsapp_number: string | null
  is_whatsapp_same_as_mobile: boolean
  can_login: boolean
  is_active: boolean
}

type RelationshipRow = {
  id: string
  flat_id: string
  relationship_type: string
  is_active: boolean
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const body = residentSchema.parse(await readJsonBody(event))
  ensureResidentRelationshipsAreValid(body)
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const beforeResult = await client.query<ResidentRow>(
      `
        select auth_user_id, full_name, email::text, mobile_number, whatsapp_number, is_whatsapp_same_as_mobile, can_login, is_active
        from users
        where id = $1 and society_id = $2
        limit 1
      `,
      [id, authMe.user.societyId],
    )
    const before = beforeResult.rows[0]

    if (!before) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Resident not found.',
      })
    }

    await client.query(
      `
        update auth_users
        set name = $2, email = $3, updated_at = now()
        where id = $1
      `,
      [before.auth_user_id, body.fullName, body.email],
    )

    await client.query(
      `
        update users
        set
          role = $3::app_role,
          full_name = $4,
          email = $5,
          mobile_number = $6,
          whatsapp_number = $7,
          is_whatsapp_same_as_mobile = $8,
          profile_image_path = $9,
          can_login = $10,
          is_active = $11,
          kyc_status = $12::verification_status,
          police_verification_status = $13::verification_status,
          government_id_type = $14,
          government_id_number = $15,
          government_id_document_path = $16,
          emergency_contact_name = $17,
          emergency_contact_number = $18,
          ownership_proof_path = $19,
          lease_agreement_path = $20,
          preferred_notification_channels = $21::notification_channel_preset,
          updated_at = now()
        where id = $1 and society_id = $2
      `,
      [
        id,
        authMe.user.societyId,
        body.role,
        body.fullName,
        body.email,
        body.mobileNumber,
        body.isWhatsappSameAsMobile ? body.mobileNumber : (body.whatsappNumber ?? null),
        body.isWhatsappSameAsMobile,
        body.profileImagePath ?? null,
        body.canLogin,
        body.isActive,
        body.kycStatus,
        body.policeVerificationStatus,
        body.governmentIdType ?? null,
        body.governmentIdNumber ?? null,
        body.governmentIdDocumentPath ?? null,
        body.emergencyContactName ?? null,
        body.emergencyContactNumber ?? null,
        body.ownershipProofPath ?? null,
        body.leaseAgreementPath ?? null,
        body.preferredNotificationChannels,
      ],
    )

    const existingRelationships = await client.query<RelationshipRow>(
      `
        select id, flat_id, relationship_type::text, is_active
        from flat_residents
        where user_id = $1
      `,
      [id],
    )

    const keepIds = new Set(body.relationships.map((item) => item.id).filter(Boolean) as string[])

    for (const row of existingRelationships.rows) {
      if (!keepIds.has(row.id)) {
        await client.query(
          `
            update flat_residents
            set is_active = false, ended_at = now(), updated_at = now()
            where id = $1
          `,
          [row.id],
        )
      }
    }

    for (const relationship of body.relationships) {
      if (relationship.id) {
        await client.query(
          `
            update flat_residents
            set
              flat_id = $2,
              relationship_type = $3::relationship_type,
              is_primary_contact = $4,
              is_billing_contact = $5,
              can_login = $6,
              is_active = $7,
              ownership_percent = $8,
              ownership_label = $9,
              ownership_start_date = $10,
              lease_start_date = $11,
              lease_end_date = $12,
              contract_start_date = $13,
              contract_end_date = $14,
              occupancy_status = $15::occupancy_status,
              access_scope = $16::access_scope,
              relationship_note = $17,
              security_deposit_amount = $18,
              security_deposit_note = $19,
              ended_at = case when $7 = false then coalesce(ended_at, now()) else null end,
              updated_at = now()
            where id = $1 and user_id = $20
          `,
          [
            relationship.id,
            relationship.flatId,
            relationship.relationshipType,
            relationship.isPrimaryContact,
            relationship.isBillingContact,
            relationship.canLogin,
            relationship.isActive,
            relationship.ownershipPercent ?? null,
            relationship.ownershipLabel ?? null,
            relationship.ownershipStartDate ?? null,
            relationship.leaseStartDate ?? null,
            relationship.leaseEndDate ?? null,
            relationship.contractStartDate ?? null,
            relationship.contractEndDate ?? null,
            relationship.occupancyStatus ?? null,
            relationship.accessScope ?? null,
            relationship.relationshipNote ?? null,
            relationship.securityDepositAmount ?? null,
            relationship.securityDepositNote ?? null,
            id,
          ],
        )
      } else {
        await client.query(
          `
            insert into flat_residents (
              flat_id,
              user_id,
              relationship_type,
              is_primary_contact,
              is_billing_contact,
              can_login,
              is_active,
              ownership_percent,
              ownership_label,
              ownership_start_date,
              lease_start_date,
              lease_end_date,
              contract_start_date,
              contract_end_date,
              occupancy_status,
              access_scope,
              relationship_note,
              security_deposit_amount,
              security_deposit_note
            )
            values (
              $1, $2, $3::relationship_type, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::occupancy_status, $16::access_scope, $17, $18, $19
            )
          `,
          [
            relationship.flatId,
            id,
            relationship.relationshipType,
            relationship.isPrimaryContact,
            relationship.isBillingContact,
            relationship.canLogin,
            relationship.isActive,
            relationship.ownershipPercent ?? null,
            relationship.ownershipLabel ?? null,
            relationship.ownershipStartDate ?? null,
            relationship.leaseStartDate ?? null,
            relationship.leaseEndDate ?? null,
            relationship.contractStartDate ?? null,
            relationship.contractEndDate ?? null,
            relationship.occupancyStatus ?? null,
            relationship.accessScope ?? null,
            relationship.relationshipNote ?? null,
            relationship.securityDepositAmount ?? null,
            relationship.securityDepositNote ?? null,
          ],
        )
      }
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action:
        before.can_login !== body.canLogin || before.is_active !== body.isActive ? 'STATE_CHANGED' : 'UPDATED',
      eventKey: 'residents.updated',
      beforeState: {
        fullName: before.full_name,
        email: before.email,
        mobileNumber: before.mobile_number,
        whatsappNumber: before.whatsapp_number,
        isWhatsappSameAsMobile: before.is_whatsapp_same_as_mobile,
        canLogin: before.can_login,
        isActive: before.is_active,
      },
      afterState: body,
      relatedEntities: [{ entityTable: 'users', entityId: id, entityLabel: body.fullName }],
      targetUserId: id,
    })

    await client.query('commit')
    return createApiSuccess(event, { id, updated: true })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
