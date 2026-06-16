import { createApiSuccess } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { listServiceDepartments, listServiceStaffOptions } from '~/server/utils/service-requests'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const pool = getDatabasePool()
  const departments = ['ADMIN', 'MANAGER', 'SERVICE_STAFF'].includes(authMe.user.role)
    ? await listServiceDepartments(authMe, false)
    : []
  const staff = ['ADMIN', 'MANAGER'].includes(authMe.user.role)
    ? await listServiceStaffOptions(authMe)
    : []
  const routes = await pool.query<{
    id: string
    category_key: string
    category_label: string
    location_type: string | null
    department_id: string
    department_name: string
    default_priority: string | null
  }>(
    `
      select
        scr.id,
        scr.category_key,
        scr.category_label,
        scr.location_type::text,
        scr.department_id,
        sd.name as department_name,
        scr.default_priority::text
      from service_category_routes scr
      inner join service_departments sd on sd.id = scr.department_id
      where scr.society_id = $1 and scr.is_active = true
      order by scr.category_label asc
    `,
    [authMe.user.societyId],
  )

  return createApiSuccess(event, {
    departments,
    staff,
    routes: routes.rows.map((row) => ({
      id: row.id,
      categoryKey: row.category_key,
      categoryLabel: row.category_label,
      locationType: row.location_type,
      departmentId: row.department_id,
      departmentName: row.department_name,
      defaultPriority: row.default_priority,
    })),
    flats: authMe.flatAccess.map((flat) => ({
      id: flat.flatId,
      label: `${flat.blockName} ${flat.flatNumber}`,
      relationshipType: flat.relationshipType,
    })),
  })
})
