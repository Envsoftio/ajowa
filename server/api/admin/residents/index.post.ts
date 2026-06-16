import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { createInviteToken, requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { buildAppUrl, sendTemplatedEmail } from '~/server/utils/email'
import { hashPassword } from 'better-auth/crypto'
import type { PoolClient } from 'pg'
import { AppError } from '~/server/utils/errors'
import {
  ensureResidentRelationshipsAreValid,
  residentSchema,
  writeMasterAudit,
} from '~/server/utils/master-data'

type ExistingUserRow = {
  auth_user_id: string
}

const ensureAuthUser = async (
  client: PoolClient,
  input: { email: string; name: string },
) => {
  const existing = await client.query<{ id: string }>(
    `
      select id
      from auth_users
      where email = $1
      limit 1
    `,
    [input.email],
  )

  if (existing.rows[0]?.id) {
    return existing.rows[0].id
  }

  const insertResult = await client.query<{ id: string }>(
    `
      insert into auth_users (name, email, email_verified)
      values ($1, $2, false)
      returning id
    `,
    [input.name, input.email],
  )

  const id = insertResult.rows[0]?.id

  if (!id) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'Auth user creation failed.',
    })
  }

  return id
}

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

const insertInviteIfRequested = async ({
  client,
  actorUserId,
  societyId,
  authUserId,
  fullName,
  email,
  mobileNumber,
  role,
  relationshipType,
  flatIds,
  flatLabels,
}: {
  client: PoolClient
  actorUserId: string
  societyId: string
  authUserId: string
  fullName: string
  email: string
  mobileNumber: string
  role: string
  relationshipType: string | null
  flatIds: string[]
  flatLabels: string[]
}) => {
  const { token, tokenHash } = createInviteToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await client.query(
    `
      update auth_invites
      set revoked_at = now(), revoked_by_user_id = $2
      where email = $1 and accepted_at is null and revoked_at is null
    `,
    [email, actorUserId],
  )

  await client.query(
    `
      insert into auth_invites (
        society_id,
        email,
        role,
        full_name,
        mobile_number,
        relationship_type,
        flat_ids,
        flat_labels,
        token_hash,
        invited_by_user_id,
        expires_at,
        accepted_by_auth_user_id
      )
      values ($1, $2, $3, $4, $5, $6, $7::uuid[], $8::text[], $9, $10, $11, $12)
    `,
    [
      societyId,
      email,
      role,
      fullName,
      mobileNumber,
      relationshipType,
      flatIds,
      flatLabels,
      tokenHash,
      actorUserId,
      expiresAt.toISOString(),
      authUserId,
    ],
  )

  await sendTemplatedEmail({
    to: email,
    subject: 'Your AJOWA invite is ready',
    template: 'invite-onboarding',
    context: {
      title: 'Accept your AJOWA invite',
      name: fullName,
      actionUrl: buildAppUrl('/accept-invite', { token }),
      expiresLabel: expiresAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
      inviterName: 'AJOWA Admin',
      roleLabel: role.replace('_', ' ').toLowerCase(),
      details: flatLabels.length > 0 ? `Assigned flats: ${flatLabels.join(', ')}.` : 'Complete onboarding to activate access.',
    },
  })
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const rawBody = await readJsonBody<Record<string, unknown>>(event)
  const body = residentSchema.parse({ ...rawBody, role: 'RESIDENT' })
  ensureResidentRelationshipsAreValid(body)
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const authUserId = await ensureAuthUser(client, {
      email: body.email,
      name: body.fullName,
    })

    const existingResult = await client.query<ExistingUserRow>(
      `
        select auth_user_id
        from users
        where society_id = $1 and email = $2
        limit 1
      `,
      [authMe.user.societyId, body.email],
    )

    if (existingResult.rows[0]?.auth_user_id) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'A resident with this email already exists in the society.',
      })
    }

    const userResult = await client.query<{ id: string }>(
      `
        insert into users (
          society_id,
          auth_user_id,
          role,
          full_name,
          email,
          mobile_number,
          whatsapp_number,
          is_whatsapp_same_as_mobile,
          profile_image_path,
          can_login,
          must_change_password,
          email_verified,
          is_active,
          kyc_status,
          police_verification_status,
          government_id_type,
          government_id_number,
          government_id_document_path,
          emergency_contact_name,
          emergency_contact_number,
          ownership_proof_path,
          lease_agreement_path,
          preferred_notification_channels
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, false, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        )
        returning id
      `,
      [
        authMe.user.societyId,
        authUserId,
        body.role,
        body.fullName,
        body.email,
        body.mobileNumber,
        body.isWhatsappSameAsMobile ? body.mobileNumber : (body.whatsappNumber ?? null),
        body.isWhatsappSameAsMobile,
        body.profileImagePath ?? null,
        body.canLogin,
        false,
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

    const userId = userResult.rows[0]?.id

    if (!userId) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Resident creation did not return an identifier.',
      })
    }

    for (const relationship of body.relationships) {
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
          userId,
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

    await seedPasswordCredential(client, authUserId, body.email)

    if (body.sendInvite) {
      const flatLabelResult = await client.query<{ flat_id: string; label: string }>(
        `
          select f.id as flat_id, concat(b.name, ' ', f.flat_number) as label
          from flats f
          inner join blocks b on b.id = f.block_id
          where f.id = any($1::uuid[])
        `,
        [body.relationships.map((item) => item.flatId)],
      )

      await insertInviteIfRequested({
        client,
        actorUserId: authMe.user.id,
        societyId: authMe.user.societyId,
        authUserId,
        fullName: body.fullName,
        email: body.email,
        mobileNumber: body.mobileNumber,
        role: body.role,
        relationshipType: body.relationships[0]?.relationshipType ?? null,
        flatIds: body.relationships.map((item) => item.flatId),
        flatLabels: flatLabelResult.rows.map((item) => item.label),
      })
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'residents.created',
      afterState: {
        ...body,
        authUserId,
      },
      relatedEntities: [{ entityTable: 'users', entityId: userId, entityLabel: body.fullName }],
      targetUserId: userId,
    })

    await client.query('commit')
    return createApiSuccess(event, { id: userId, authUserId })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
