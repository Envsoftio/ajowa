import { createPaginatedSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { parseListQuery, relationshipTypes } from '~/server/utils/master-data'
import {
  mapResidentProfessionProfile,
  residentProfessionProfileSelectSql,
  type ResidentProfessionProfileRow,
} from '~/server/utils/professions'
import type { ResidentSummary } from '~/types/domain'

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
  created_at: string
  updated_at: string
  relationship_types: string | null
  flat_numbers: string | null
  flat_count: string
  active_relationship_count: string
}

const sourceEmailSql = `
  max(
    case
      when fr.import_metadata->>'relationshipSource' = 'OWNER'
        and upper(coalesce(btrim(fr.import_metadata #>> '{sourceData,EMAIL ID}'), '')) not in ('', 'NA', 'N/A', '--', 'NIL')
        then btrim(fr.import_metadata #>> '{sourceData,EMAIL ID}')
      else null
    end
  )::text
`

const sourceContactSql = `
  max(
    case
      when fr.import_metadata->>'relationshipSource' = 'OWNER'
        and upper(coalesce(btrim(fr.import_metadata #>> '{sourceData,CONTACT DETAILS}'), '')) not in ('', 'NA', 'N/A', '--', 'NIL')
        then btrim(fr.import_metadata #>> '{sourceData,CONTACT DETAILS}')
      else null
    end
  )::text
`

const sortColumns: Record<string, string> = {
  fullName: 'u.full_name',
  email: `coalesce(u.email::text, ${sourceEmailSql})`,
  role: 'u.role',
  canLogin: 'u.can_login',
  isActive: 'u.is_active',
  kycStatus: 'u.kyc_status',
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = parseListQuery(event)
  const pool = getDatabasePool()
  const where: string[] = ['u.society_id = $1', `u.role = 'RESIDENT'`]
  const values: unknown[] = [authMe.user.societyId]

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
            and search_fr.import_metadata->>'relationshipSource' = 'OWNER'
            and (
              coalesce(search_fr.import_metadata #>> '{sourceData,EMAIL ID}', '') ilike $${values.length}
              or coalesce(search_fr.import_metadata #>> '{sourceData,CONTACT DETAILS}', '') ilike $${values.length}
            )
        )
      )`,
    )
  }

  const activeFilter = query.filters.isActive?.[0]
  if (activeFilter === 'true' || activeFilter === 'false') {
    values.push(activeFilter === 'true')
    where.push(`u.is_active = $${values.length}`)
  }

  const loginFilter = query.filters.canLogin?.[0]
  if (loginFilter === 'true' || loginFilter === 'false') {
    values.push(loginFilter === 'true')
    where.push(`u.can_login = $${values.length}`)
  }

  const relationshipTypeFilter = query.filters.relationshipType?.[0]
  const hasRelationshipTypeFilter = relationshipTypes.includes(
    relationshipTypeFilter as (typeof relationshipTypes)[number],
  )

  const flatFilter = query.filters.flatId?.[0]
  if (flatFilter) {
    values.push(flatFilter)
    const flatParam = values.length
    let relationshipCondition = ''

    if (hasRelationshipTypeFilter) {
      values.push(relationshipTypeFilter)
      relationshipCondition = `and filter_fr.relationship_type = $${values.length}::relationship_type`
    }

    where.push(`
      exists (
        select 1
        from flat_residents filter_fr
        inner join flats filter_f on filter_f.id = filter_fr.flat_id
        where filter_fr.user_id = u.id
          and filter_f.society_id = u.society_id
          and filter_f.id = $${flatParam}
          ${relationshipCondition}
      )
    `)
  } else if (hasRelationshipTypeFilter) {
    values.push(relationshipTypeFilter)
    where.push(`
      exists (
        select 1
        from flat_residents filter_fr
        inner join flats filter_f on filter_f.id = filter_fr.flat_id
        where filter_fr.user_id = u.id
          and filter_f.society_id = u.society_id
          and filter_fr.relationship_type = $${values.length}::relationship_type
      )
    `)
  }

  const professionFilter = query.filters.professionId?.[0]
  if (professionFilter) {
    values.push(professionFilter)
    where.push(`
      exists (
        select 1
        from resident_profession_profiles filter_rpp
        where filter_rpp.user_id = u.id
          and filter_rpp.society_id = u.society_id
          and filter_rpp.is_active = true
          and filter_rpp.profession_id = $${values.length}
      )
    `)
  }

  const whereSql = where.join(' and ')
  const orderBy = sortColumns[query.sortBy ?? 'fullName'] ?? 'u.full_name'
  const direction = query.sortDirection === 'desc' ? 'desc' : 'asc'
  values.push(query.pageSize, (query.page - 1) * query.pageSize)

  const [dataResult, countResult] = await Promise.all([
    pool.query<ResidentRow>(
      `
        select
          u.id,
          u.society_id,
          u.auth_user_id,
          u.role::text,
          u.full_name,
          u.email::text,
          ${sourceEmailSql} as source_email,
          u.mobile_number,
          ${sourceContactSql} as source_contact,
          u.whatsapp_number,
          u.is_whatsapp_same_as_mobile,
          u.profile_image_path,
          u.can_login,
          u.email_verified,
          u.is_active,
          u.kyc_status::text,
          u.police_verification_status::text,
          u.created_at::text,
          u.updated_at::text,
          string_agg(distinct fr.relationship_type::text, ', ' order by fr.relationship_type::text) as relationship_types,
          string_agg(distinct f.flat_number, ', ' order by f.flat_number) as flat_numbers,
          count(distinct fr.flat_id)::text as flat_count,
          count(fr.id) filter (where fr.is_active = true)::text as active_relationship_count
        from users u
        left join flat_residents fr on fr.user_id = u.id
        left join flats f on f.id = fr.flat_id
        where ${whereSql}
        group by u.id
        order by ${orderBy} ${direction}, u.full_name asc
        limit $${values.length - 1}
        offset $${values.length}
      `,
      values,
    ),
    pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from users u
        where ${whereSql}
      `,
      values.slice(0, values.length - 2),
    ),
  ])

  const userIds = dataResult.rows.map((row) => row.id)
  const profileResult = userIds.length
    ? await pool.query<ResidentProfessionProfileRow>(
        `
          ${residentProfessionProfileSelectSql}
          where rpp.user_id = any($1::uuid[]) and rpp.society_id = $2
        `,
        [userIds, authMe.user.societyId],
      )
    : { rows: [] }
  const profileByUserId = new Map(
    profileResult.rows.map((row) => [
      row.user_id,
      mapResidentProfessionProfile(row),
    ]),
  )

  const items: ResidentSummary[] = dataResult.rows.map((row) => ({
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
    professionProfile: profileByUserId.get(row.id) ?? null,
    relationshipTypes:
      row.relationship_types?.split(', ').filter(Boolean) ?? [],
    flatNumbers: row.flat_numbers?.split(', ').filter(Boolean) ?? [],
    flatCount: Number(row.flat_count),
    activeRelationshipCount: Number(row.active_relationship_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return createPaginatedSuccess(
    event,
    items,
    Number(countResult.rows[0]?.count ?? 0),
    query,
  )
})
