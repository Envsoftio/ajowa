import { z } from 'zod'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getQuerySafe } from '~/server/utils/master-data'
import type {
  ProfessionDirectoryEntry,
  ProfessionSummary,
} from '~/types/domain'

type ProfessionOptionRow = {
  id: string
  society_id: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
  is_public_allowed: boolean
  created_at: string
  updated_at: string
}

type DirectoryRow = {
  id: string
  user_id: string
  resident_name: string
  profession_id: string
  profession_name: string
  admin_note: string | null
  public_phone: string | null
  public_email: string | null
  flat_labels: string[]
  relationship_types: string[]
  updated_at: string
}

const optionalUuid = z.string().uuid().optional()

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const query = getQuerySafe(event)
  const professionId = optionalUuid.parse(
    typeof query.professionId === 'string' && query.professionId
      ? query.professionId
      : undefined,
  )
  const pool = getDatabasePool()
  const values: unknown[] = [authMe.user.societyId]
  const where: string[] = [
    'rpp.society_id = $1',
    'rpp.is_active = true',
    'rpp.is_public = true',
    'rpp.revoked_at is null',
    'p.is_active = true',
    'p.is_public_allowed = true',
    `u.role = 'RESIDENT'`,
    'u.is_active = true',
  ]

  if (professionId) {
    values.push(professionId)
    where.push(`rpp.profession_id = $${values.length}`)
  }

  const [professionResult, directoryResult] = await Promise.all([
    pool.query<ProfessionOptionRow>(
      `
        select
          id,
          society_id,
          name,
          description,
          sort_order,
          is_active,
          is_public_allowed,
          created_at::text,
          updated_at::text
        from professions
        where society_id = $1
          and is_active = true
          and is_public_allowed = true
        order by sort_order asc, name asc
      `,
      [authMe.user.societyId],
    ),
    pool.query<DirectoryRow>(
      `
        select
          rpp.id,
          u.id as user_id,
          u.full_name as resident_name,
          p.id as profession_id,
          p.name as profession_name,
          rpp.admin_note,
          case when rpp.share_phone then rpp.public_phone else null end as public_phone,
          case when rpp.share_email then rpp.public_email::text else null end as public_email,
          array_agg(distinct concat_ws(' ', b.name, f.flat_number) order by concat_ws(' ', b.name, f.flat_number)) as flat_labels,
          array_agg(distinct fr.relationship_type::text order by fr.relationship_type::text) as relationship_types,
          rpp.updated_at::text
        from resident_profession_profiles rpp
        inner join professions p on p.id = rpp.profession_id
        inner join users u on u.id = rpp.user_id
        inner join flat_residents fr on fr.user_id = u.id
          and fr.is_active = true
          and fr.relationship_type = 'OWNER'
        inner join flats f on f.id = fr.flat_id and f.society_id = rpp.society_id
        inner join blocks b on b.id = f.block_id
        where ${where.join(' and ')}
        group by rpp.id, u.id, p.id
        order by p.name asc, u.full_name asc
      `,
      values,
    ),
  ])

  const professions: ProfessionSummary[] = professionResult.rows.map((row) => ({
    id: row.id,
    societyId: row.society_id,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    isPublicAllowed: row.is_public_allowed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
  const items: ProfessionDirectoryEntry[] = directoryResult.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    residentName: row.resident_name,
    professionId: row.profession_id,
    professionName: row.profession_name,
    adminNote: row.admin_note,
    publicPhone: row.public_phone,
    publicEmail: row.public_email,
    flatLabels: row.flat_labels ?? [],
    relationshipTypes: row.relationship_types ?? [],
    updatedAt: row.updated_at,
  }))

  return createApiSuccess(event, { professions, items })
})
