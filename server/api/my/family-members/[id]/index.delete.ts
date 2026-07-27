import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import {
  getManagedFamilyMember,
  mapFamilyMember,
  recomputeFamilyAccess,
} from '~/server/utils/family-members'
import { readUuidParam, writeMasterAudit } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const userId = readUuidParam(event)
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')

    const before = await getManagedFamilyMember(client, authMe, userId)

    await client.query(
      `
        update flat_residents
        set is_active = false,
            ended_at = coalesce(ended_at, now()),
            updated_at = now()
        where id = $1
          and user_id = $2
          and relationship_type = 'FAMILY_MEMBER'
      `,
      [before.relationship_id, userId],
    )

    await recomputeFamilyAccess(client, authMe.user.societyId, [userId])

    const remainingRelationships = await client.query<{ has_active_relationship: boolean }>(
      `
        select exists (
          select 1
          from flat_residents
          where user_id = $1
            and is_active = true
            and (ended_at is null or ended_at > now())
        ) as has_active_relationship
      `,
      [userId],
    )

    if (!remainingRelationships.rows[0]?.has_active_relationship) {
      await client.query(
        `
          update users
          set is_active = false,
              deleted_at = coalesce(deleted_at, now()),
              updated_at = now()
          where id = $1
            and society_id = $2
            and role = 'RESIDENT'
            and can_login = false
        `,
        [userId, authMe.user.societyId],
      )
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'DELETED',
      eventKey: 'family_member.removed',
      beforeState: mapFamilyMember(before),
      afterState: { ...mapFamilyMember(before), isActive: false },
      relatedEntities: [{ entityTable: 'users', entityId: userId, entityLabel: before.full_name }],
      targetUserId: userId,
    })

    await client.query('commit')

    return createApiSuccess(event, { removed: true })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
