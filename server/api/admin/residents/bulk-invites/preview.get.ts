import { z } from 'zod'
import { createApiSuccess, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getQuerySafe } from '~/server/utils/master-data'

const schema = z.object({
  search: z.string().trim().max(120).optional().default(''),
  flatId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).optional().default('true'),
  canLogin: z.enum(['true', 'false']).optional().default('false'),
})

type PreviewRow = {
  total_matching: string
  expected_invites: string
  skipped_missing_login_identity: string
  skipped_invalid_login_identity: string
  skipped_duplicate_login_identity: string
  syncable_existing_login_flats: string
}

const sourceEmailSql = `
  (
    select btrim(source_fr.import_metadata #>> '{sourceData,EMAIL ID}')
    from flat_residents source_fr
    where source_fr.user_id = u.id
      and source_fr.import_metadata->>'relationshipSource' in ('OWNER', 'TENANT')
      and upper(coalesce(btrim(source_fr.import_metadata #>> '{sourceData,EMAIL ID}'), '')) not in ('', 'NA', 'N/A', '--', 'NIL')
    order by
      case source_fr.import_metadata->>'relationshipSource'
        when 'OWNER' then 0
        when 'TENANT' then 1
        else 2
      end,
      source_fr.created_at
    limit 1
  )
`

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = validateInput(schema, getQuerySafe(event))
  const values: unknown[] = [authMe.user.societyId]
  const where = ['u.society_id = $1', `u.role = 'RESIDENT'`]

  if (query.search) {
    values.push(`%${query.search}%`)
    where.push(
      `(
        u.full_name ilike $${values.length}
        or coalesce(u.email::text, '') ilike $${values.length}
        or coalesce(u.mobile_number, '') ilike $${values.length}
        or exists (
          select 1
          from flat_residents search_fr
          where search_fr.user_id = u.id
            and search_fr.import_metadata->>'relationshipSource' in ('OWNER', 'TENANT')
            and (
              coalesce(search_fr.import_metadata #>> '{sourceData,EMAIL ID}', '') ilike $${values.length}
              or coalesce(search_fr.import_metadata #>> '{sourceData,CONTACT DETAILS}', '') ilike $${values.length}
            )
        )
      )`,
    )
  }

  values.push(query.isActive === 'true')
  where.push(`u.is_active = $${values.length}`)

  values.push(query.canLogin === 'true')
  where.push(`u.can_login = $${values.length}`)

  if (query.flatId) {
    values.push(query.flatId)
    where.push(`
      exists (
        select 1
        from flat_residents filter_fr
        inner join flats filter_f on filter_f.id = filter_fr.flat_id
        where filter_fr.user_id = u.id
          and filter_f.society_id = u.society_id
          and filter_f.id = $${values.length}
      )
    `)
  }

  const result = await getDatabasePool().query<PreviewRow>(
    `
      with matching_residents as (
        select
          u.id,
          u.society_id,
          lower(coalesce(u.email::text, ${sourceEmailSql})) as email
        from users u
        where ${where.join(' and ')}
      ),
      candidate_residents as (
        select
          id,
          society_id,
          email,
          email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$' as email_valid
        from matching_residents
        where email is not null
      ),
      invite_groups as (
        select
          society_id,
          email,
          array_agg(id) as user_ids,
          count(*)::int as row_count
        from candidate_residents
        where email_valid = true
        group by society_id, email
      ),
      external_duplicate_groups as (
        select group_row.*
        from invite_groups group_row
        where exists (
          select 1
          from users duplicate_user
          where duplicate_user.society_id = group_row.society_id
            and duplicate_user.email = group_row.email
            and duplicate_user.id <> all(group_row.user_ids)
        )
      ),
      sendable_groups as (
        select group_row.*
        from invite_groups group_row
        where not exists (
          select 1
          from external_duplicate_groups duplicate_group
          where duplicate_group.society_id = group_row.society_id
            and duplicate_group.email = group_row.email
        )
      ),
      active_login_duplicate_groups as (
        select
          group_row.*,
          duplicate_user.id as target_user_id
        from external_duplicate_groups group_row
        inner join users duplicate_user
          on duplicate_user.society_id = group_row.society_id
         and duplicate_user.email = group_row.email
         and duplicate_user.id <> all(group_row.user_ids)
         and duplicate_user.role = 'RESIDENT'
         and duplicate_user.can_login = true
         and duplicate_user.auth_user_id is not null
      ),
      syncable_owner_flats as (
        select distinct duplicate_group.target_user_id, source_fr.flat_id
        from active_login_duplicate_groups duplicate_group
        inner join flat_residents source_fr
          on source_fr.user_id = any(duplicate_group.user_ids)
         and source_fr.is_active = true
         and source_fr.relationship_type = 'OWNER'
        where not exists (
          select 1
          from flat_residents existing_fr
          where existing_fr.user_id = duplicate_group.target_user_id
            and existing_fr.flat_id = source_fr.flat_id
            and existing_fr.is_active = true
        )
      )
      select
        (select count(*) from matching_residents)::text as total_matching,
        (select count(*) from sendable_groups)::text as expected_invites,
        (select count(*) from matching_residents where email is null)::text as skipped_missing_login_identity,
        (
          select count(*)
          from candidate_residents
          where email_valid = false
        )::text as skipped_invalid_login_identity,
        coalesce((
          select sum(row_count)
          from external_duplicate_groups
        ), 0)::text as skipped_duplicate_login_identity,
        (select count(*) from syncable_owner_flats)::text as syncable_existing_login_flats
    `,
    values,
  )

  const row = result.rows[0]

  return createApiSuccess(event, {
    totalMatching: Number(row?.total_matching ?? 0),
    expectedInvites: Number(row?.expected_invites ?? 0),
    skippedMissingLoginIdentity: Number(
      row?.skipped_missing_login_identity ?? 0,
    ),
    skippedInvalidLoginIdentity: Number(
      row?.skipped_invalid_login_identity ?? 0,
    ),
    skippedDuplicateLoginIdentity: Number(
      row?.skipped_duplicate_login_identity ?? 0,
    ),
    syncableExistingLoginFlats: Number(row?.syncable_existing_login_flats ?? 0),
  })
})
