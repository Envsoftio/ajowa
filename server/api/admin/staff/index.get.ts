import { createPaginatedSuccess } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { parseListQuery } from '~/server/utils/master-data'
import { normalizeRolePermissions } from '~/shared/permissions'
import type { StaffSummary } from '~/types/domain'

type StaffRow = {
  id: string
  society_id: string
  auth_user_id: string
  role: 'MANAGER' | 'SERVICE_STAFF' | 'GUARD'
  full_name: string
  email: string
  mobile_number: string
  whatsapp_number: string | null
  profile_image_path: string | null
  can_login: boolean
  email_verified: boolean
  is_active: boolean
  staff_permissions: string[]
  created_at: string
  updated_at: string
}

type StaffDepartmentRow = {
  user_id: string
  department_id: string
  department_code: string
  department_name: string
  is_primary: boolean
}

const sortColumns: Record<string, string> = {
  fullName: 'u.full_name',
  email: 'u.email',
  role: 'u.role',
  canLogin: 'u.can_login',
  isActive: 'u.is_active',
}

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'staff.manage')
  const query = parseListQuery(event)
  const pool = getDatabasePool()
  const where: string[] = [
    'u.society_id = $1',
    `u.role in ('MANAGER', 'SERVICE_STAFF', 'GUARD')`,
    'u.deleted_at is null',
  ]
  const values: unknown[] = [authMe.user.societyId]

  if (query.search) {
    values.push(`%${query.search}%`)
    where.push(`(u.full_name ilike $${values.length} or u.email ilike $${values.length} or u.mobile_number ilike $${values.length})`)
  }

  const roleFilter = query.filters.role?.[0]
  if (['MANAGER', 'SERVICE_STAFF', 'GUARD'].includes(roleFilter ?? '')) {
    values.push(roleFilter)
    where.push(`u.role::text = $${values.length}`)
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

  const whereSql = where.join(' and ')
  const orderBy = sortColumns[query.sortBy ?? 'fullName'] ?? 'u.full_name'
  const direction = query.sortDirection === 'desc' ? 'desc' : 'asc'
  values.push(query.pageSize, (query.page - 1) * query.pageSize)

  const [dataResult, countResult] = await Promise.all([
    pool.query<StaffRow>(
      `
        select
          u.id,
          u.society_id,
          u.auth_user_id,
          u.role::text as role,
          u.full_name,
          u.email::text,
          u.mobile_number,
          u.whatsapp_number,
          u.profile_image_path,
          u.can_login,
          u.email_verified,
          u.is_active,
          u.staff_permissions,
          u.created_at::text,
          u.updated_at::text
        from users u
        where ${whereSql}
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

  const staffIds = dataResult.rows.map((row) => row.id)
  const departmentResult = staffIds.length > 0
    ? await pool.query<StaffDepartmentRow>(
        `
          select
            ssa.user_id,
            sd.id as department_id,
            sd.code as department_code,
            sd.name as department_name,
            ssa.is_primary
          from service_staff_assignments ssa
          inner join service_departments sd on sd.id = ssa.department_id
          where ssa.user_id = any($1::uuid[])
            and sd.society_id = $2
            and ssa.is_active = true
          order by sd.name asc
        `,
        [staffIds, authMe.user.societyId],
      )
    : { rows: [] }

  const departmentsByStaffId = new Map<string, StaffDepartmentRow[]>()

  for (const department of departmentResult.rows) {
    const existing = departmentsByStaffId.get(department.user_id) ?? []
    existing.push(department)
    departmentsByStaffId.set(department.user_id, existing)
  }

  const items: StaffSummary[] = dataResult.rows.map((row) => {
    const departments = departmentsByStaffId.get(row.id) ?? []

    return {
      id: row.id,
      societyId: row.society_id,
      authUserId: row.auth_user_id,
      role: row.role,
      fullName: row.full_name,
      email: row.email,
      mobileNumber: row.mobile_number,
      whatsappNumber: row.whatsapp_number,
      profileImagePath: row.profile_image_path,
      canLogin: row.can_login,
      emailVerified: row.email_verified,
      isActive: row.is_active,
      profileImageUpdatedAt: row.profile_image_path ? row.updated_at : null,
      permissions: normalizeRolePermissions(row.role, row.staff_permissions),
      departments: departments.map((department) => ({
        id: department.department_id,
        code: department.department_code,
        name: department.department_name,
        isPrimary: department.is_primary,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })

  return createPaginatedSuccess(event, items, Number(countResult.rows[0]?.count ?? 0), query)
})
