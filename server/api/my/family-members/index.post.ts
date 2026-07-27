import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import {
  assertOwnsFlat,
  countActiveFamilyMembers,
  familyMemberSchema,
  lockFamilyMemberScopes,
  mapFamilyMember,
  MAX_OWNER_FAMILY_MEMBERS,
  recomputeFamilyAccess,
  type FamilyMemberRow,
} from '~/server/utils/family-members'
import { writeMasterAudit } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const body = validateInput(familyMemberSchema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')

    const { ownedFlats } = await assertOwnsFlat(client, authMe, body.flatId)
    await lockFamilyMemberScopes(
      client,
      authMe.user.societyId,
      ownedFlats.map((flat) => flat.flat_id),
    )
    const memberCount = await countActiveFamilyMembers(
      client,
      authMe.user.societyId,
      ownedFlats.map((flat) => flat.flat_id),
    )

    if (memberCount >= MAX_OWNER_FAMILY_MEMBERS) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: `You can add up to ${MAX_OWNER_FAMILY_MEMBERS} family members.`,
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
          can_login,
          must_change_password,
          email_verified,
          is_active,
          kyc_status,
          police_verification_status,
          preferred_notification_channels
        )
        values (
          $1, null, 'RESIDENT', $2, null, $3, null, false, false, false, false, true, 'NOT_REQUIRED', 'NOT_REQUIRED', 'IN_APP'
        )
        returning id
      `,
      [
        authMe.user.societyId,
        body.fullName,
        body.mobileNumber ?? null,
      ],
    )
    const userId = userResult.rows[0]?.id

    if (!userId) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Family member creation did not return an identifier.',
      })
    }

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
          access_scope,
          relationship_note
        )
        values ($1, $2, 'FAMILY_MEMBER', false, false, false, true, 'HOUSEHOLD', $3)
      `,
      [body.flatId, userId, body.relationshipNote ?? null],
    )

    await recomputeFamilyAccess(client, authMe.user.societyId, [userId])

    const memberResult = await client.query<FamilyMemberRow>(
      `
        select
          fr.id as relationship_id,
          u.id as user_id,
          u.full_name,
          u.mobile_number,
          u.profile_image_path,
          u.updated_at::text,
          fr.flat_id,
          concat(b.name, ' ', f.flat_number) as flat_label,
          fr.relationship_note,
          fr.is_active
        from flat_residents fr
        inner join users u on u.id = fr.user_id
        inner join flats f on f.id = fr.flat_id
        inner join blocks b on b.id = f.block_id
        where u.id = $1
        limit 1
      `,
      [userId],
    )

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'family_member.created',
      beforeState: null,
      afterState: mapFamilyMember(memberResult.rows[0]!),
      relatedEntities: [{ entityTable: 'users', entityId: userId, entityLabel: body.fullName }],
      targetUserId: userId,
    })

    await client.query('commit')

    return createApiSuccess(event, mapFamilyMember(memberResult.rows[0]!))
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
