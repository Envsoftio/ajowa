import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import {
  getOwnedFlatRows,
  mapFamilyMember,
  type FamilyMemberRow,
  MAX_OWNER_FAMILY_MEMBERS,
} from '~/server/utils/family-members'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const client = await getDatabasePool().connect()

  try {
    const flats = await getOwnedFlatRows(client, authMe)
    const flatIds = flats.map((flat) => flat.flat_id)
    const members = flatIds.length
      ? await client.query<FamilyMemberRow>(
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
            where fr.flat_id = any($1::uuid[])
              and f.society_id = $2
              and fr.relationship_type = 'FAMILY_MEMBER'
              and fr.is_active = true
              and u.is_active = true
              and u.can_login = false
              and u.deleted_at is null
            order by b.name, f.flat_number, u.full_name
          `,
          [flatIds, authMe.user.societyId],
        )
      : { rows: [] as FamilyMemberRow[] }

    return createApiSuccess(event, {
      maxMembers: MAX_OWNER_FAMILY_MEMBERS,
      flats: flats.map((flat) => ({
        id: flat.flat_id,
        label: flat.label,
      })),
      members: members.rows.map(mapFamilyMember),
    })
  } finally {
    client.release()
  }
})
