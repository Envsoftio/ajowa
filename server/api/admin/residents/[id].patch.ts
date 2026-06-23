import { hashPassword } from 'better-auth/crypto'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import {
  ensureResidentRelationshipsAreValid,
  readUuidParam,
  residentSchema,
  writeMasterAudit,
} from '~/server/utils/master-data'
import { recomputeUserAccessForActiveBillingPeriods } from '~/server/utils/qr-access'

type ResidentRow = {
  auth_user_id: string | null
  full_name: string
  email: string | null
  mobile_number: string | null
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

const nullableEmailSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value ?? null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}, z.string().email().nullable())

const residentUpdateSchema = residentSchema.extend({
  email: nullableEmailSchema,
})

type PgError = Error & {
  code?: string
  constraint?: string
}

const isPgError = (error: unknown): error is PgError =>
  error instanceof Error && 'code' in error

const seedPasswordCredential = async (
  client: PoolClient,
  authUserId: string,
  email: string,
) => {
  const credentialResult = await client.query<{ id: string }>(
    `
      select id
      from auth_accounts
      where provider_id = 'credential' and user_id = $1
      limit 1
    `,
    [authUserId],
  )

  if (credentialResult.rows[0]?.id) {
    return
  }

  const passwordHash = await hashPassword(`Ajowa@${email.slice(0, 4)}2026`)
  await client.query(
    `
      insert into auth_accounts (account_id, provider_id, user_id, password)
      values ($1, 'credential', $2, $3)
    `,
    [authUserId, authUserId, passwordHash],
  )
}

const resolveAuthUserForResidentUpdate = async (
  client: PoolClient,
  input: {
    currentUserId: string
    currentAuthUserId: string | null
    email: string
    fullName: string
  },
) => {
  const existingAuthResult = await client.query<{
    id: string
    linked_user_id: string | null
  }>(
    `
      select au.id, linked_user.id as linked_user_id
      from auth_users au
      left join users linked_user
        on linked_user.auth_user_id = au.id
       and linked_user.id <> $2
      where au.email = $1
      limit 1
    `,
    [input.email, input.currentUserId],
  )
  const existingAuth = existingAuthResult.rows[0]

  if (input.currentAuthUserId) {
    if (existingAuth && existingAuth.id !== input.currentAuthUserId) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'This email is already linked to another login account.',
      })
    }

    await client.query(
      `
        update auth_users
        set name = $2, email = $3, updated_at = now()
        where id = $1
      `,
      [input.currentAuthUserId, input.fullName, input.email],
    )

    await seedPasswordCredential(client, input.currentAuthUserId, input.email)
    return input.currentAuthUserId
  }

  if (existingAuth?.linked_user_id) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'This email is already linked to another login account.',
    })
  }

  if (existingAuth) {
    await client.query(
      `
        update auth_users
        set name = $2, updated_at = now()
        where id = $1
      `,
      [existingAuth.id, input.fullName],
    )
    await seedPasswordCredential(client, existingAuth.id, input.email)
    return existingAuth.id
  }

  const insertResult = await client.query<{ id: string }>(
    `
      insert into auth_users (name, email, email_verified)
      values ($1, $2, false)
      returning id
    `,
    [input.fullName, input.email],
  )
  const authUserId = insertResult.rows[0]?.id

  if (!authUserId) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'Auth user creation failed.',
    })
  }

  await seedPasswordCredential(client, authUserId, input.email)
  return authUserId
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const body = validateInput(residentUpdateSchema, await readJsonBody(event))
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

    if (body.canLogin && !body.email) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'A login-enabled resident must have a real email.',
      })
    }

    let authUserId = before.auth_user_id

    if (body.email) {
      const duplicateEmailResult = await client.query<{
        id: string
        full_name: string
      }>(
        `
          select id, full_name
          from users
          where society_id = $1
            and email = $2
            and id <> $3
          limit 1
        `,
        [authMe.user.societyId, body.email, id],
      )
      const duplicateEmail = duplicateEmailResult.rows[0]

      if (duplicateEmail) {
        throw new AppError({
          code: 'CONFLICT',
          statusCode: 409,
          message: `This email is already used by ${duplicateEmail.full_name}.`,
        })
      }

      authUserId = await resolveAuthUserForResidentUpdate(client, {
        currentUserId: id,
        currentAuthUserId: before.auth_user_id,
        email: body.email,
        fullName: body.fullName,
      })
    }

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
          auth_user_id = $22,
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
        body.isWhatsappSameAsMobile
          ? body.mobileNumber
          : (body.whatsappNumber ?? null),
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
        authUserId,
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

    const keepIds = new Set(
      body.relationships.map((item) => item.id).filter(Boolean) as string[],
    )

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
              ownership_start_date = $8,
              lease_start_date = $9,
              lease_end_date = $10,
              contract_start_date = $11,
              contract_end_date = $12,
              occupancy_status = $13::occupancy_status,
              access_scope = $14::access_scope,
              relationship_note = $15,
              ended_at = case when $7 = false then coalesce(ended_at, now()) else null end,
              updated_at = now()
            where id = $1 and user_id = $16
          `,
          [
            relationship.id,
            relationship.flatId,
            relationship.relationshipType,
            relationship.isPrimaryContact,
            relationship.isBillingContact,
            relationship.canLogin,
            relationship.isActive,
            relationship.ownershipStartDate ?? null,
            relationship.leaseStartDate ?? null,
            relationship.leaseEndDate ?? null,
            relationship.contractStartDate ?? null,
            relationship.contractEndDate ?? null,
            relationship.occupancyStatus ?? null,
            relationship.accessScope ?? null,
            relationship.relationshipNote ?? null,
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
              ownership_start_date,
              lease_start_date,
              lease_end_date,
              contract_start_date,
              contract_end_date,
              occupancy_status,
              access_scope,
              relationship_note
            )
            values (
              $1, $2, $3::relationship_type, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::occupancy_status, $14::access_scope, $15
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
            relationship.ownershipStartDate ?? null,
            relationship.leaseStartDate ?? null,
            relationship.leaseEndDate ?? null,
            relationship.contractStartDate ?? null,
            relationship.contractEndDate ?? null,
            relationship.occupancyStatus ?? null,
            relationship.accessScope ?? null,
            relationship.relationshipNote ?? null,
          ],
        )
      }
    }

    await recomputeUserAccessForActiveBillingPeriods(
      client,
      authMe.user.societyId,
      [id],
    )

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action:
        before.can_login !== body.canLogin || before.is_active !== body.isActive
          ? 'STATE_CHANGED'
          : 'UPDATED',
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
      relatedEntities: [
        { entityTable: 'users', entityId: id, entityLabel: body.fullName },
      ],
      targetUserId: id,
    })

    await client.query('commit')
    return createApiSuccess(event, { id, updated: true })
  } catch (error) {
    await client.query('rollback')

    if (isPgError(error) && error.code === '23505') {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'This email is already linked to another account.',
      })
    }

    if (
      isPgError(error) &&
      error.code === '23514' &&
      error.constraint === 'users_login_requires_auth_email'
    ) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message:
          'A login-enabled resident must have a real email and auth account.',
      })
    }

    throw error
  } finally {
    client.release()
  }
})
