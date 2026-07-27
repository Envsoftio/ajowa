import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import {
  assertOwnsFlat,
  familyMemberSchema,
  getManagedFamilyMember,
  mapFamilyMember,
  recomputeFamilyAccess,
  type FamilyMemberRow,
} from '~/server/utils/family-members'
import { readUuidParam, writeMasterAudit } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const userId = readUuidParam(event)
  const body = validateInput(familyMemberSchema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')

    const before = await getManagedFamilyMember(client, authMe, userId)
    await assertOwnsFlat(client, authMe, body.flatId)

    await client.query(
      `
        update users
        set full_name = $3,
            mobile_number = $4,
            updated_at = now()
        where id = $1
          and society_id = $2
          and role = 'RESIDENT'
          and can_login = false
          and deleted_at is null
      `,
      [userId, authMe.user.societyId, body.fullName, body.mobileNumber ?? null],
    )

    await client.query(
      `
        update flat_residents
        set flat_id = $3,
            relationship_note = $4,
            updated_at = now()
        where id = $1
          and user_id = $2
          and relationship_type = 'FAMILY_MEMBER'
      `,
      [before.relationship_id, userId, body.flatId, body.relationshipNote ?? null],
    )

    await recomputeFamilyAccess(client, authMe.user.societyId, [userId])

    const updatedResult = await client.query<FamilyMemberRow>(
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
          and fr.id = $2
        limit 1
      `,
      [userId, before.relationship_id],
    )

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'UPDATED',
      eventKey: 'family_member.updated',
      beforeState: mapFamilyMember(before),
      afterState: mapFamilyMember(updatedResult.rows[0]!),
      relatedEntities: [{ entityTable: 'users', entityId: userId, entityLabel: body.fullName }],
      targetUserId: userId,
    })

    await client.query('commit')

    return createApiSuccess(event, mapFamilyMember(updatedResult.rows[0]!))
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
